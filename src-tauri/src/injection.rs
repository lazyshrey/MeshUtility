
use regex::{Regex, RegexBuilder};

/// Apply every user-defined replacement.
///
/// Features:
/// * **Case-insensitive matching** — Whisper capitalizes the first word of
///   sentences, so "cloud" should still match "Cloud".
/// * **Word boundaries** — "cloud" matches "cloud" but not "cloudy".
/// * **Slash alternatives** — an entry like `shree/shri/shiree` is treated as
///   three equivalent spoken forms that all map to the same replacement.
/// * **Casing preservation** — if the matched text starts with a capital
///   letter, the replacement is capitalized too. If the whole match is
///   uppercase, the replacement is uppercased.
/// * **Longest-match priority** — longer spoken patterns run first, so a rule
///   for "machine learning" wins over a rule for "machine".
pub fn apply_dictionary(text: &str) -> Result<String, String> {
    let entries: Vec<(String, String)> = {
        let conn = crate::db::DB_CONN.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT spoken, replaced FROM dictionary ORDER BY length(spoken) DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut final_text = text.to_string();

    for (spoken, replaced) in &entries {
        // Expand slash-separated alternatives.
        let variants: Vec<String> = spoken
            .split('/')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if variants.is_empty() {
            continue;
        }

        // Build regex: \b(var1|var2|...)\b  with case-insensitive flag.
        // If a variant is a single non-alphanumeric symbol, fall back to plain
        // escaped replacement to keep things predictable.
        let pattern = variants
            .iter()
            .map(|v| regex::escape(v))
            .collect::<Vec<_>>()
            .join("|");

        // Detect if the variants begin/end with word chars so \b is safe.
        let uses_boundary = variants
            .iter()
            .all(|v| v.chars().next().map_or(false, |c| c.is_alphanumeric()));

        let full_pattern = if uses_boundary {
            format!(r"\b({})\b", pattern)
        } else {
            format!(r"({})", pattern)
        };

        let re = match RegexBuilder::new(&full_pattern)
            .case_insensitive(true)
            .build()
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        final_text = apply_regex_preserving_case(&re, &final_text, replaced);
    }

    Ok(final_text)
}

/// Replace every match but keep the original casing pattern (Title / UPPER / lower).
fn apply_regex_preserving_case(re: &Regex, text: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for m in re.find_iter(text) {
        out.push_str(&text[last..m.start()]);
        out.push_str(&match_casing(m.as_str(), replacement));
        last = m.end();
    }
    out.push_str(&text[last..]);
    out
}

fn match_casing(matched: &str, replacement: &str) -> String {
    if matched.is_empty() || replacement.is_empty() {
        return replacement.to_string();
    }
    let is_all_upper = matched.chars().all(|c| !c.is_alphabetic() || c.is_uppercase());
    if is_all_upper && matched.chars().any(|c| c.is_alphabetic()) {
        return replacement.to_uppercase();
    }
    let first_upper = matched.chars().next().map_or(false, |c| c.is_uppercase());
    if first_upper {
        let mut chars = replacement.chars();
        match chars.next() {
            Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
            None => String::new(),
        }
    } else {
        replacement.to_string()
    }
}

// ─── Text injection ─────────────────────────────────────────────────────────
//
// Strategy order (Windows; other platforms fall back to enigo):
// 1. SendInput with Unicode (KEYEVENTF_UNICODE) — works in almost every text
//    field including classic cmd.exe, PowerShell, VS Code terminal, Notepad,
//    browsers, IDE editors. Bypasses the clipboard entirely.
// 2. Clipboard + Ctrl+V — used only if SendInput fails (rare).
// 3. Shift+Insert — legacy Unix-style terminals (mintty, Git Bash) that don't
//    honour Ctrl+V and refuse SendInput for paste.

pub fn inject_text(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        if let Err(unicode_err) = send_unicode_windows(text) {
            eprintln!("[MeshVoice] SendInput unicode failed: {}", unicode_err);
        } else {
            return Ok(());
        }
    }

    // Clipboard path — preserve and restore whatever the user had.
    clipboard_paste(text, /* try_shift_insert_fallback */ true)
}

#[cfg(target_os = "windows")]
fn send_unicode_windows(text: &str) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    };

    // Break into UTF-16 code units. Surrogate pairs must be emitted as two
    // INPUTs each, which `encode_utf16` handles for us.
    let units: Vec<u16> = text.encode_utf16().collect();
    if units.is_empty() {
        return Ok(());
    }

    // 2 INPUTs per unit (key down + up). Send in chunks to avoid buffer limits.
    const CHUNK: usize = 100;
    for chunk in units.chunks(CHUNK) {
        let mut inputs: Vec<INPUT> = Vec::with_capacity(chunk.len() * 2);
        for &u in chunk {
            inputs.push(unicode_input(u, KEYBD_EVENT_FLAGS(0)));
            inputs.push(unicode_input(u, KEYEVENTF_KEYUP));
        }

        let sent = unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32)
        };
        if (sent as usize) != inputs.len() {
            return Err(format!(
                "SendInput accepted {} of {} events (input blocked by foreground app or UIPI).",
                sent,
                inputs.len()
            ));
        }

        // Tiny pause so hosts that throttle WM_CHAR don't drop characters.
        std::thread::sleep(std::time::Duration::from_millis(2));
    }

    fn unicode_input(ch: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(0),
                    wScan: ch,
                    dwFlags: KEYEVENTF_UNICODE | flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    Ok(())
}

fn clipboard_paste(text: &str, _try_shift_insert_fallback: bool) -> Result<(), String> {
    crate::clipboard::GLOBAL_CLIPBOARD.paste_text_transaction(
        text,
        /* restore_clipboard = */ true,
        /* is_term = */ false,
        /* cap_len = */ 0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn case_preserved_capital() {
        let re = RegexBuilder::new(r"\b(cloud)\b")
            .case_insensitive(true)
            .build()
            .unwrap();
        assert_eq!(
            apply_regex_preserving_case(&re, "Cloud is great", "claude"),
            "Claude is great"
        );
    }

    #[test]
    fn word_boundary_stops_partial_match() {
        let re = RegexBuilder::new(r"\b(cloud)\b")
            .case_insensitive(true)
            .build()
            .unwrap();
        assert_eq!(
            apply_regex_preserving_case(&re, "that is cloudy today", "claude"),
            "that is cloudy today"
        );
    }

    #[test]
    fn all_uppercase_preserved() {
        let re = RegexBuilder::new(r"\b(api)\b")
            .case_insensitive(true)
            .build()
            .unwrap();
        assert_eq!(
            apply_regex_preserving_case(&re, "the API is live", "asi"),
            "the ASI is live"
        );
    }
}
