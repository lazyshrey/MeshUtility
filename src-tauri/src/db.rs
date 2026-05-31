use rusqlite::{params, Connection};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::path::PathBuf;

pub static DB_CONN: Lazy<Mutex<Connection>> = Lazy::new(|| {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("MeshVoice");
    std::fs::create_dir_all(&path).ok();
    path.push("meshvoice.sqlite");
    let conn = Connection::open(path).expect("Failed to open SQLite database");
    Mutex::new(conn)
});

pub fn init_db() {
    let conn = DB_CONN.lock().unwrap();
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS history (
            id          INTEGER PRIMARY KEY,
            text        TEXT NOT NULL,
            word_count  INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            source      TEXT NOT NULL,
            audio_path  TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lifetime_stats (
            id                INTEGER PRIMARY KEY CHECK (id = 1),
            total_words       INTEGER NOT NULL DEFAULT 0,
            total_duration_ms INTEGER NOT NULL DEFAULT 0,
            session_count     INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS dictionary (
            id      INTEGER PRIMARY KEY,
            spoken  TEXT NOT NULL,
            replaced TEXT NOT NULL
        );
        -- Add audio_path column if it doesn't exist yet (migration)
        ALTER TABLE history ADD COLUMN audio_path TEXT;
    ").ok(); // .ok() ignores 'duplicate column' error on re-run

    let has_lifetime_stats: i64 = conn
        .query_row("SELECT COUNT(*) FROM lifetime_stats WHERE id = 1", [], |r| r.get(0))
        .unwrap_or(0);
    if has_lifetime_stats == 0 {
        conn.execute(
            "INSERT INTO lifetime_stats (id, total_words, total_duration_ms, session_count)
             SELECT 1, COALESCE(SUM(word_count),0), COALESCE(SUM(duration_ms),0), COUNT(id)
             FROM history",
            [],
        ).ok();
    }

    // Sanitize hotkey: bare modifiers like "Alt" crash tauri-plugin-global-shortcut.
    // Reset to default if the stored value doesn't contain a '+' (meaning no non-modifier key).
    let hotkey_val: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key='hotkey'", [], |r| r.get(0))
        .ok();
    if let Some(hk) = hotkey_val {
        if !hk.contains('+') {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key,value) VALUES ('hotkey','Alt+Space')", [],
            ).ok();
        }
    }
}

pub fn record_lifetime_stats(word_count: i64, duration_ms: i64) {
    let conn = DB_CONN.lock().unwrap();
    conn.execute(
        "INSERT INTO lifetime_stats (id, total_words, total_duration_ms, session_count)
         VALUES (1, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
            total_words = total_words + excluded.total_words,
            total_duration_ms = total_duration_ms + excluded.total_duration_ms,
            session_count = session_count + 1",
        params![word_count.max(0), duration_ms.max(0)],
    ).ok();
}

#[derive(serde::Serialize, Clone)]
pub struct HistoryRecord {
    pub id: i64,
    pub text: String,
    pub word_count: i64,
    pub duration_ms: i64,
    pub source: String,
    pub audio_path: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn get_history(limit: i64) -> Vec<HistoryRecord> {
    let conn = DB_CONN.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, text, word_count, duration_ms, source, audio_path, created_at
         FROM history ORDER BY id DESC LIMIT ?"
    ).unwrap();
    let rows = stmt.query_map([limit], |row| {
        Ok(HistoryRecord {
            id: row.get(0)?,
            text: row.get(1)?,
            word_count: row.get(2)?,
            duration_ms: row.get(3)?,
            source: row.get(4)?,
            audio_path: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

#[allow(dead_code)]
pub fn latest_transcript() -> Option<String> {
    let conn = DB_CONN.lock().ok()?;
    conn.query_row("SELECT text FROM history ORDER BY id DESC LIMIT 1", [], |r| r.get(0)).ok()
}

#[tauri::command]
pub fn get_history_audio(id: i64) -> Result<Vec<u8>, String> {
    let path: String = {
        let conn = DB_CONN.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT audio_path FROM history WHERE id = ?", [id], |r| r.get(0))
            .map_err(|_| "Recording not found for this history item.".to_string())?
    };

    let path = std::path::PathBuf::from(path);
    let recordings_dir = crate::audio::recordings_dir()
        .canonicalize()
        .map_err(|e| format!("Recordings folder unavailable: {}", e))?;
    let canonical = path
        .canonicalize()
        .map_err(|_| "Recorded audio file is missing.".to_string())?;

    if !canonical.starts_with(&recordings_dir) {
        return Err("Recorded audio path is outside the MeshVoice recordings folder.".into());
    }

    std::fs::read(canonical).map_err(|e| format!("Could not read recorded audio: {}", e))
}

#[tauri::command]
pub fn delete_history_entry(id: i64) {
    // Also delete audio file if present
    {
        let conn = DB_CONN.lock().unwrap();
        let path: Option<String> = conn
            .query_row("SELECT audio_path FROM history WHERE id = ?", [id], |r| r.get(0))
            .ok()
            .flatten();
        if let Some(p) = path {
            std::fs::remove_file(p).ok();
        }
        conn.execute("DELETE FROM history WHERE id = ?", [id]).unwrap();
    }
    // Enforce max 10
    prune_history();
}

#[tauri::command]
pub fn delete_all_history() {
    let conn = DB_CONN.lock().unwrap();
    // Delete all audio files
    let mut stmt = conn.prepare("SELECT audio_path FROM history").unwrap();
    let paths: Vec<Option<String>> = stmt.query_map([], |r| r.get(0)).unwrap()
        .filter_map(|r| r.ok()).collect();
    for p in paths.into_iter().flatten() {
        std::fs::remove_file(p).ok();
    }
    conn.execute("DELETE FROM history", []).unwrap();
}

/// Keep only the 10 most recent entries.
#[allow(dead_code)]
pub fn prune_history() {
    let conn = DB_CONN.lock().unwrap();
    // Get IDs of entries beyond top 10
    let mut stmt = conn.prepare(
        "SELECT id, audio_path FROM history ORDER BY id DESC LIMIT -1 OFFSET 10"
    ).unwrap();
    let old: Vec<(i64, Option<String>)> = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
        .filter_map(|r| r.ok()).collect();
    for (id, path) in old {
        if let Some(p) = path { std::fs::remove_file(p).ok(); }
        conn.execute("DELETE FROM history WHERE id = ?", [id]).unwrap();
    }
}

#[derive(serde::Serialize)]
pub struct Stats {
    pub total_words: i64,
    pub total_minutes: i64,
    pub session_count: i64,
    pub avg_wpm: i64,
}

#[tauri::command]
pub fn get_stats() -> Stats {
    let conn = DB_CONN.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT total_words, total_duration_ms, session_count FROM lifetime_stats WHERE id = 1"
    ).unwrap();
    let mut rows = stmt.query([]).unwrap();
    if let Some(row) = rows.next().unwrap() {
        let total_words: i64 = row.get(0).unwrap_or(0);
        let total_ms: i64 = row.get(1).unwrap_or(0);
        let session_count: i64 = row.get(2).unwrap_or(0);
        let total_minutes = (total_ms + 59_999) / 60_000;
        let avg_wpm = if total_ms > 0 { total_words * 60_000 / total_ms } else { 0 };
        Stats { total_words, total_minutes, session_count, avg_wpm }
    } else {
        Stats { total_words: 0, total_minutes: 0, session_count: 0, avg_wpm: 0 }
    }
}

#[tauri::command]
pub fn get_setting(key: String) -> Option<String> {
    let conn = DB_CONN.lock().unwrap();
    conn.query_row("SELECT value FROM settings WHERE key = ?", [key], |r| r.get(0)).ok()
}

#[tauri::command]
pub fn set_setting(key: String, value: String) {
    let conn = DB_CONN.lock().unwrap();
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", params![key, value]).unwrap();
}

#[derive(serde::Serialize)]
pub struct DictionaryEntry { pub id: i64, pub spoken: String, pub replaced: String }

#[tauri::command]
pub fn get_dictionary() -> Vec<DictionaryEntry> {
    let conn = DB_CONN.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, spoken, replaced FROM dictionary").unwrap();
    let rows = stmt.query_map([], |row| {
        Ok(DictionaryEntry { id: row.get(0)?, spoken: row.get(1)?, replaced: row.get(2)? })
    }).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

#[tauri::command]
pub fn add_dictionary_entry(spoken: String, replaced: String) {
    let conn = DB_CONN.lock().unwrap();
    conn.execute("INSERT INTO dictionary (spoken, replaced) VALUES (?, ?)", params![spoken, replaced]).unwrap();
}

#[tauri::command]
pub fn delete_dictionary_entry(id: i64) {
    let conn = DB_CONN.lock().unwrap();
    conn.execute("DELETE FROM dictionary WHERE id = ?", params![id]).unwrap();
}
