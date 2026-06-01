use serde::Serialize;
use tauri::Emitter;

const PARAKEET_BUNDLE_ID: &str = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
const PARAKEET_MODEL_BASE: &str = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main";
const MIN_ENCODER_BYTES: u64 = 650_000_000;
const MIN_DECODER_BYTES: u64 = 11_000_000;
const MIN_JOINER_BYTES: u64 = 6_000_000;
const MIN_TOKENS_BYTES: u64 = 80_000;

#[derive(Serialize, Clone)]
pub struct WhisperModel {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub size_mb: i64,
    pub download_url: String,
    pub language: String,
    pub can_translate: bool,
    pub accuracy: u8,
    pub speed: u8,
    pub recommended: bool,
    pub runtime: String,
}

#[tauri::command]
pub fn get_available_models() -> Vec<WhisperModel> {
    let hf = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
    vec![
        WhisperModel { id: "parakeet-v3".into(), name: "Parakeet V3".into(), description: "Recommended Parakeet V3 runtime bundle using sherpa-onnx INT8 for local Windows transcription.".into(), filename: PARAKEET_BUNDLE_ID.into(), size_mb: 640, download_url: "meshvoice://parakeet-v3".into(), language: "25 languages".into(), can_translate: false, accuracy: 96, speed: 92, recommended: true, runtime: "sherpa-onnx".into() },
        WhisperModel { id: "tiny".into(),   name: "Whisper Tiny".into(),     description: "Ultra-fast, basic accuracy.".into(),               filename: "ggml-tiny.en.bin".into(),        size_mb: 75,   download_url: format!("{}/ggml-tiny.en.bin", hf),        language: "English".into(),        can_translate: false, accuracy: 40, speed: 98, recommended: false, runtime: "whisper.cpp".into() },
        WhisperModel { id: "base".into(),   name: "Whisper Base".into(),     description: "Fast and fairly accurate. Best starting point.".into(), filename: "ggml-base.en.bin".into(),     size_mb: 142,  download_url: format!("{}/ggml-base.en.bin", hf),       language: "English".into(),        can_translate: false, accuracy: 62, speed: 90, recommended: false, runtime: "whisper.cpp".into() },
        WhisperModel { id: "small".into(),  name: "Whisper Small".into(),    description: "Good balance, multilingual.".into(),                 filename: "ggml-small.bin".into(),          size_mb: 466,  download_url: format!("{}/ggml-small.bin", hf),          language: "Multi-language".into(), can_translate: true,  accuracy: 74, speed: 80, recommended: false, runtime: "whisper.cpp".into() },

        WhisperModel { id: "distil-large".into(), name: "Whisper Distil-Large".into(), description: "Great accuracy with faster inference than Large v3.".into(), filename: "ggml-distil-large-v3.bin".into(), size_mb: 1520, download_url: format!("{}/ggml-distil-large-v3.bin", hf), language: "Multi-language".into(), can_translate: true, accuracy: 90, speed: 72, recommended: false, runtime: "whisper.cpp".into() },
        WhisperModel { id: "turbo".into(),  name: "Whisper Turbo".into(),    description: "Large model distilled for speed.".into(),            filename: "ggml-large-v3-turbo.bin".into(), size_mb: 1500, download_url: format!("{}/ggml-large-v3-turbo.bin", hf), language: "Multi-language".into(), can_translate: true,  accuracy: 88, speed: 70, recommended: false, runtime: "whisper.cpp".into() },
        WhisperModel {
            id: "hinglish-apex".into(),
            name: "Hindi2Hinglish Apex".into(),
            description: "Oriserve's fine-tuned model for transcribing Hindi directly to Romanized Hinglish. Highly accurate for Indian accents.".into(),
            filename: "ggml-hindi2hinglish-apex-q5_1.bin".into(),
            size_mb: 204,
            download_url: "https://huggingface.co/voquill/whisper-hindi2hinglish-apex-ggml/resolve/main/ggml-hindi2hinglish-apex-q5_1.bin".into(),
            language: "Hinglish \u{00b7} Hindi+English".into(),
            can_translate: false,
            accuracy: 85,
            speed: 40,
            recommended: false,
            runtime: "whisper.cpp".into(),
        },


    ]
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    filename: String,
    progress: u64,
    downloaded_mb: u64,
    total_mb: u64,
    done: bool,
    error: Option<String>,
}

/// Real HTTP download with streaming progress and .part → rename pattern.
#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    filename: String,
    download_url: String,
) -> Result<(), String> {
    if filename == PARAKEET_BUNDLE_ID {
        return download_parakeet_bundle(app, filename).await;
    }


    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let dest = crate::audio::models_dir().join(&filename);

    // Already fully downloaded?
    if let Ok(meta) = std::fs::metadata(&dest) {
        if meta.len() > 1_000_000 {
            let _ = app.emit("model-download-progress", DownloadProgress {
                filename: filename.clone(), progress: 100,
                downloaded_mb: meta.len() / 1_048_576,
                total_mb: meta.len() / 1_048_576,
                done: true, error: None,
            });
            return Ok(());
        }
    }

    let part = dest.with_extension("bin.part");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build().map_err(|e| e.to_string())?;

    let resp = client.get(&download_url).send().await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let total_mb = total / 1_048_576;
    let mut downloaded: u64 = 0;
    let mut last_pct: u64 = 0;

    let mut file = tokio::fs::File::create(&part).await
        .map_err(|e| format!("Cannot create file: {}", e))?;

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let pct = if total > 0 { downloaded * 100 / total } else { 0 };
        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit("model-download-progress", DownloadProgress {
                filename: filename.clone(),
                progress: pct,
                downloaded_mb: downloaded / 1_048_576,
                total_mb,
                done: false,
                error: None,
            });
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    tokio::fs::rename(&part, &dest).await
        .map_err(|e| format!("Rename failed: {}", e))?;

    let _ = app.emit("model-download-progress", DownloadProgress {
        filename: filename.clone(),
        progress: 100,
        downloaded_mb: downloaded / 1_048_576,
        total_mb,
        done: true,
        error: None,
    });
    Ok(())
}

pub fn parakeet_bundle_dir() -> std::path::PathBuf {
    crate::audio::models_dir().join(PARAKEET_BUNDLE_ID)
}

pub fn parakeet_bundle_ready() -> bool {
    let dir = parakeet_bundle_dir();
    file_has_min_size(&dir.join("encoder.int8.onnx"), MIN_ENCODER_BYTES)
        && file_has_min_size(&dir.join("decoder.int8.onnx"), MIN_DECODER_BYTES)
        && file_has_min_size(&dir.join("joiner.int8.onnx"), MIN_JOINER_BYTES)
        && file_has_min_size(&dir.join("tokens.txt"), MIN_TOKENS_BYTES)
}

async fn download_parakeet_bundle(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let model_dir = parakeet_bundle_dir();
    tokio::fs::create_dir_all(&model_dir).await.map_err(|e| e.to_string())?;

    // Only the 4 model files need downloading.
    // The runtime (sherpa-onnx-offline.exe + DLLs) is bundled with the app.
    let files = [
        ("encoder.int8.onnx", format!("{}/encoder.int8.onnx", PARAKEET_MODEL_BASE), 652_184_281_u64, MIN_ENCODER_BYTES),
        ("decoder.int8.onnx", format!("{}/decoder.int8.onnx", PARAKEET_MODEL_BASE), 11_845_275_u64,  MIN_DECODER_BYTES),
        ("joiner.int8.onnx",  format!("{}/joiner.int8.onnx",  PARAKEET_MODEL_BASE), 6_355_277_u64,   MIN_JOINER_BYTES),
        ("tokens.txt",        format!("{}/tokens.txt",        PARAKEET_MODEL_BASE), 93_939_u64,      MIN_TOKENS_BYTES),
    ];
    let expected_total_bytes: u64 = files.iter().map(|(_, _, b, _)| *b).sum();
    let mut completed_bytes = 0_u64;

    for (name, url, expected_bytes, min_bytes) in files {
        let dest = model_dir.join(name);
        if file_has_min_size(&dest, min_bytes) {
            completed_bytes = completed_bytes.saturating_add(expected_bytes);
            emit_download_progress_bytes(&app, &filename, completed_bytes.min(expected_total_bytes), expected_total_bytes, false, None);
            continue;
        }
        download_file(&app, &filename, &url, &dest, completed_bytes, expected_total_bytes, expected_bytes, min_bytes).await?;
        completed_bytes = completed_bytes.saturating_add(expected_bytes);
        emit_download_progress_bytes(&app, &filename, completed_bytes.min(expected_total_bytes), expected_total_bytes, false, None);
    }

    if !parakeet_bundle_ready() {
        return Err("Parakeet bundle download did not complete. Retry from Settings.".into());
    }

    emit_download_progress_bytes(&app, &filename, expected_total_bytes, expected_total_bytes, true, None);
    Ok(())
}

async fn download_file(
    app: &tauri::AppHandle,
    filename: &str,
    url: &str,
    dest: &std::path::Path,
    completed_bytes: u64,
    expected_total_bytes: u64,
    expected_file_bytes: u64,
    min_bytes: u64,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let part = dest.with_extension("part");
    let resume_from = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    if resume_from >= min_bytes {
        if dest.exists() {
            let _ = tokio::fs::remove_file(dest).await;
        }
        tokio::fs::rename(&part, dest).await.map_err(|e| format!("Rename failed: {}", e))?;
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url);
    if resume_from > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={}-", resume_from));
    }
    let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {} while downloading {}", resp.status(), url));
    }
    let server_resumed = resume_from > 0 && resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let resume_from = if resume_from > 0 && !server_resumed {
        let _ = tokio::fs::remove_file(&part).await;
        0
    } else {
        resume_from
    };

    let total_bytes = resp.content_length().map(|remaining| resume_from.saturating_add(remaining)).unwrap_or(expected_file_bytes).max(1);
    let mut downloaded: u64 = resume_from;
    let mut last_pct = 0_u64;
    let mut file = if resume_from > 0 {
        tokio::fs::OpenOptions::new().append(true).open(&part).await
    } else {
        tokio::fs::File::create(&part).await
    }.map_err(|e| format!("Cannot create file: {}", e))?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        let file_progress_bytes = expected_file_bytes.saturating_mul(downloaded).saturating_div(total_bytes).min(expected_file_bytes);
        let current_bytes = completed_bytes.saturating_add(file_progress_bytes).min(expected_total_bytes);
        let pct = current_bytes.saturating_mul(100).saturating_div(expected_total_bytes).min(99);
        if pct != last_pct {
            last_pct = pct;
            emit_download_progress_bytes(app, filename, current_bytes, expected_total_bytes, false, None);
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    if !file_has_min_size(&part, min_bytes) {
        return Err(format!("Downloaded file is incomplete: {}", dest.display()));
    }
    if dest.exists() {
        let _ = tokio::fs::remove_file(dest).await;
    }
    tokio::fs::rename(&part, dest).await.map_err(|e| format!("Rename failed: {}", e))?;
    Ok(())
}

fn file_has_min_size(path: &std::path::Path, min_bytes: u64) -> bool {
    std::fs::metadata(path).map(|m| m.len() >= min_bytes).unwrap_or(false)
}

fn emit_download_progress_bytes(
    app: &tauri::AppHandle,
    filename: &str,
    downloaded_bytes: u64,
    total_bytes: u64,
    done: bool,
    error: Option<String>,
) {
    let total_mb = total_bytes.div_ceil(1_048_576);
    let downloaded_mb = downloaded_bytes.div_ceil(1_048_576).min(total_mb);
    let progress = if done { 100 } else { downloaded_bytes.saturating_mul(100).saturating_div(total_bytes).min(99) };
    emit_download_progress(app, filename, progress, downloaded_mb, total_mb, done, error);
}

fn emit_download_progress(
    app: &tauri::AppHandle,
    filename: &str,
    progress: u64,
    downloaded_mb: u64,
    total_mb: u64,
    done: bool,
    error: Option<String>,
) {
    let _ = app.emit("model-download-progress", DownloadProgress {
        filename: filename.to_string(),
        progress,
        downloaded_mb,
        total_mb,
        done,
        error,
    });
}

/// Groq Whisper API — used when no local model is loaded.
pub async fn transcribe_via_groq(samples: &[f32], api_key: &str) -> Result<String, String> {
    let form = groq_audio_form(samples, "text")?;

    let resp = reqwest::Client::new()
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send().await.map_err(|e| e.to_string())?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if status.is_success() { Ok(body.trim().to_string()) }
    else { Err(format!("Groq error {}: {}", status, body)) }
}

pub async fn transcribe_via_meshpilot_cloud(samples: &[f32], access_token: &str) -> Result<String, String> {
    let form = groq_audio_form(samples, "json")?;

    let resp = reqwest::Client::new()
        .post("https://meshpilot.in/api/meshvoice/transcribe")
        .bearer_auth(access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("MeshPilot cloud transcription network error: {e}"))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("MeshPilot cloud transcription failed ({status}): {}", truncate_error(&body)));
    }

    parse_cloud_transcript(&body)
        .ok_or_else(|| "MeshPilot cloud transcription returned an empty transcript.".to_string())
}

fn groq_audio_form(samples: &[f32], response_format: &'static str) -> Result<reqwest::multipart::Form, String> {
    let bytes = wav_bytes(samples);
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    Ok(reqwest::multipart::Form::new()
        .text("model", "whisper-large-v3")
        .text("response_format", response_format)
        .part("file", part))
}

fn wav_bytes(samples: &[f32]) -> Vec<u8> {
    let data_size = (samples.len() * 2) as u32;
    let mut bytes = Vec::with_capacity(44 + samples.len() * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&16000u32.to_le_bytes());
    bytes.extend_from_slice(&32000u32.to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_size.to_le_bytes());
    for &sample in samples {
        bytes.extend_from_slice(&((sample.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }
    bytes
}

fn parse_cloud_transcript(body: &str) -> Option<String> {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(text) = json.get("text").and_then(|value| value.as_str()) {
            let trimmed = text.trim();
            return (!trimmed.is_empty()).then(|| trimmed.to_string());
        }
    }
    let trimmed = body.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn truncate_error(body: &str) -> String {
    let normalized = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= 300 {
        return normalized;
    }
    let mut out = normalized.chars().take(300).collect::<String>();
    out.push_str("...");
    out
}


