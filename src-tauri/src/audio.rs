use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

#[derive(serde::Serialize)]
pub struct MicrophoneStatus {
    pub available: bool,
    pub ready: bool,
    pub selected_device: Option<String>,
    pub default_device: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct TranscriptionComplete {
    pub text: String,
    pub word_count: i64,
    pub duration_ms: i64,
    pub source: String,
}

pub static AUDIO_BUFFER: std::sync::LazyLock<Arc<Mutex<Vec<f32>>>> =
    std::sync::LazyLock::new(|| Arc::new(Mutex::new(Vec::new())));

pub(crate) static DEVICE_SAMPLE_RATE: Mutex<u32> = Mutex::new(44100);
static CAPTURE_CONTROL: std::sync::LazyLock<Mutex<Option<std::sync::mpsc::SyncSender<CaptureCommand>>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));
static CAPTURE_ACTIVE: AtomicBool = AtomicBool::new(false);
static LAST_RMS: Mutex<f32> = Mutex::new(0.0);

const MAX_CAPTURE_SECONDS: usize = 600;
const PREROLL_MS: usize = 240;
const START_RMS_THRESHOLD: f32 = 0.004;
const END_RMS_THRESHOLD: f32 = 0.003;
const MIN_SPEECH_MS: usize = 90;
const TRAILING_SILENCE_MS: usize = 360;

enum CaptureCommand {
    Start(std::sync::mpsc::SyncSender<Result<u32, String>>),
}

pub fn recordings_dir() -> std::path::PathBuf {
    let mut p = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    p.push("MeshVoice"); p.push("recordings");
    std::fs::create_dir_all(&p).ok(); p
}

pub fn models_dir() -> std::path::PathBuf {
    let mut p = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    p.push("MeshVoice"); p.push("models");
    std::fs::create_dir_all(&p).ok(); p
}

#[tauri::command]
pub fn open_mic_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "ms-settings:privacy-microphone"])
            .spawn()
            .map_err(|e| format!("Could not open Windows microphone settings: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}

#[tauri::command]
pub fn get_audio_devices() -> Vec<String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let mut devices = Vec::new();
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            if let Ok(name) = device.name() {
                devices.push(name);
            }
        }
    }
    devices
}

#[tauri::command]
pub fn check_microphone_status() -> MicrophoneStatus {
    let host = cpal::default_host();
    let default_device = host.default_input_device().and_then(|d| d.name().ok());
    let device = match get_selected_device() {
        Some(device) => device,
        None => {
            return MicrophoneStatus {
                available: false,
                ready: false,
                selected_device: None,
                default_device,
                error: Some("No microphone found. Connect a microphone or enable one in Windows Sound settings.".into()),
            };
        }
    };
    let selected_device = device.name().ok();
    let config = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            return MicrophoneStatus {
                available: true,
                ready: false,
                selected_device,
                default_device,
                error: Some(format!("Microphone is available but cannot be configured: {}", error)),
            };
        }
    };

    match probe_input_stream(&device, &config) {
        Ok(()) => MicrophoneStatus {
            available: true,
            ready: true,
            selected_device,
            default_device,
            error: None,
        },
        Err(error) => MicrophoneStatus {
            available: true,
            ready: false,
            selected_device,
            default_device,
            error: Some(error),
        },
    }
}

fn probe_input_stream(device: &cpal::Device, cfg: &cpal::SupportedStreamConfig) -> Result<(), String> {
    let stream_config: cpal::StreamConfig = cfg.clone().into();
    let err = |e| eprintln!("[MeshVoice] microphone probe: {}", e);
    let stream = match cfg.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(&stream_config, |_data: &[f32], _| {}, err, None),
        cpal::SampleFormat::I16 => device.build_input_stream(&stream_config, |_data: &[i16], _| {}, err, None),
        cpal::SampleFormat::U16 => device.build_input_stream(&stream_config, |_data: &[u16], _| {}, err, None),
        cpal::SampleFormat::I8 => device.build_input_stream(&stream_config, |_data: &[i8], _| {}, err, None),
        cpal::SampleFormat::U8 => device.build_input_stream(&stream_config, |_data: &[u8], _| {}, err, None),
        cpal::SampleFormat::I32 => device.build_input_stream(&stream_config, |_data: &[i32], _| {}, err, None),
        cpal::SampleFormat::U32 => device.build_input_stream(&stream_config, |_data: &[u32], _| {}, err, None),
        cpal::SampleFormat::F64 => device.build_input_stream(&stream_config, |_data: &[f64], _| {}, err, None),
        _ => return Err("Unsupported microphone sample format.".into()),
    }.map_err(|e| format_microphone_error("Microphone stream creation failed", e))?;

    stream.play().map_err(|e| format_microphone_error("Microphone access failed", e))?;
    std::thread::sleep(std::time::Duration::from_millis(220));
    Ok(())
}

fn get_selected_device() -> Option<cpal::Device> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    
    let preferred = {
        let conn = crate::db::DB_CONN.lock().unwrap();
        conn.query_row("SELECT value FROM settings WHERE key='microphone'", [], |r| r.get::<_,String>(0)).ok()
    };
    
    if let Some(pref) = preferred.filter(|p| !p.trim().is_empty()) {
        if let Ok(input_devices) = host.input_devices() {
            for device in input_devices {
                if device.name().unwrap_or_default() == pref && device.default_input_config().is_ok() {
                    return Some(device);
                }
            }
        }
    }

    if let Some(device) = host.default_input_device() {
        if device.default_input_config().is_ok() {
            return Some(device);
        }
    }

    host.input_devices().ok()?.find(|device| device.default_input_config().is_ok())
}

fn ensure_capture_stream() -> Result<(), String> {
    let sender = {
        let mut guard = CAPTURE_CONTROL.lock().unwrap();
        if let Some(sender) = guard.as_ref() {
            sender.clone()
        } else {
            let sender = spawn_capture_thread()?;
            *guard = Some(sender.clone());
            sender
        }
    };

    let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
    if sender.send(CaptureCommand::Start(reply_tx)).is_err() {
        *CAPTURE_CONTROL.lock().unwrap() = None;
        return ensure_capture_stream();
    }

    let rate = reply_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .map_err(|_| "Microphone stream did not become ready.".to_string())??;
    *DEVICE_SAMPLE_RATE.lock().unwrap() = rate;
    Ok(())
}

fn spawn_capture_thread() -> Result<std::sync::mpsc::SyncSender<CaptureCommand>, String> {
    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel::<Result<std::sync::mpsc::SyncSender<CaptureCommand>, String>>(1);
    std::thread::spawn(move || {
        run_capture_thread(ready_tx);
    });

    ready_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .map_err(|_| "Microphone thread did not initialize.".to_string())?
}

fn run_capture_thread(ready_tx: std::sync::mpsc::SyncSender<Result<std::sync::mpsc::SyncSender<CaptureCommand>, String>>) {
    let device = match get_selected_device() {
        Some(device) => device,
        None => {
            let _ = ready_tx.send(Err("No microphone found. Please check your system settings.".into()));
            return;
        }
    };
    let cfg = match device.default_input_config() {
        Ok(cfg) => cfg,
        Err(e) => {
            let _ = ready_tx.send(Err(format!("Mic config error: {}", e)));
            return;
        }
    };
    let sample_rate = cfg.sample_rate().0;
    let stream_config: cpal::StreamConfig = cfg.clone().into();
    let channels = cfg.channels() as usize;
    let sample_rate_for_callback = sample_rate;
    let err = |e| eprintln!("[MeshVoice] {}", e);

    let stream = match cfg.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().map(|&s| s as f32 / 32768.0 - 1.0).sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::I8 => device.build_input_stream(
            &stream_config,
            move |data: &[i8], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().map(|&s| s as f32 / 128.0).sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::U8 => device.build_input_stream(
            &stream_config,
            move |data: &[u8], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().map(|&s| s as f32 / 128.0 - 1.0).sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::I32 => device.build_input_stream(
            &stream_config,
            move |data: &[i32], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().map(|&s| s as f32 / 2_147_483_648.0).sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::U32 => device.build_input_stream(
            &stream_config,
            move |data: &[u32], _| append_input_frames(data.chunks(channels).map(|frame| frame.iter().map(|&s| s as f32 / 2_147_483_648.0 - 1.0).sum::<f32>() / channels as f32), sample_rate_for_callback),
            err,
            None,
        ),
        cpal::SampleFormat::F64 => device.build_input_stream(
            &stream_config,
            move |data: &[f64], _| append_input_frames(data.chunks(channels).map(|frame| (frame.iter().sum::<f64>() / channels as f64) as f32), sample_rate_for_callback),
            err,
            None,
        ),
        _ => {
            let _ = ready_tx.send(Err("Unsupported microphone sample format.".into()));
            return;
        }
    };
    let stream = match stream {
        Ok(stream) => stream,
        Err(e) => {
            let _ = ready_tx.send(Err(format_microphone_error("Stream creation failed", e)));
            return;
        }
    };

    if let Err(e) = stream.play() {
        let _ = ready_tx.send(Err(format_microphone_error("Microphone access failed", e)));
        return;
    }
    let (tx, rx) = std::sync::mpsc::sync_channel::<CaptureCommand>(8);
    let _ = ready_tx.send(Ok(tx.clone()));
    let _stream = stream;
    while let Ok(command) = rx.recv() {
        match command {
            CaptureCommand::Start(reply) => {
                let _ = reply.send(Ok(sample_rate));
            }
        };
    }
}

fn append_input_frames<I>(samples: I, sample_rate: u32)
where
    I: IntoIterator<Item = f32>,
{
    if !CAPTURE_ACTIVE.load(Ordering::Relaxed) {
        return;
    }

    let mut b = AUDIO_BUFFER.lock().unwrap();
    let max_samples = sample_rate as usize * MAX_CAPTURE_SECONDS;
    let before = b.len();
    for sample in samples {
        b.push(sample.clamp(-1.0, 1.0));
    }

    if b.len() > max_samples {
        let overflow = b.len() - max_samples;
        b.drain(0..overflow);
    }

    let new = &b[before.min(b.len())..];
    if !new.is_empty() {
        let rms = (new.iter().map(|s| s * s).sum::<f32>() / new.len() as f32).sqrt().clamp(0.0, 1.0);
        *LAST_RMS.lock().unwrap() = rms;
    }
}

#[tauri::command]
pub async fn start_recording(
    _app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<u64, String> {
    if *state.is_recording.lock().unwrap() {
        return Ok(*state.recording_session_id.lock().unwrap());
    }
    AUDIO_BUFFER.lock().unwrap().clear();
    ensure_capture_stream()?;
    let session_id = {
        let mut id = state.recording_session_id.lock().unwrap();
        *id = if *id == u64::MAX { 1 } else { *id + 1 };
        *id
    };
    CAPTURE_ACTIVE.store(true, Ordering::SeqCst);
    *state.is_recording.lock().unwrap() = true;

    Ok(session_id)
}

#[tauri::command]
pub async fn stop_recording_and_transcribe(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    duration_ms: i64,
    access_token: Option<String>,
    session_id: Option<u64>,
) -> Result<String, String> {
    if let Some(stop_session_id) = session_id {
        let current_session_id = *state.recording_session_id.lock().unwrap();
        if stop_session_id != current_session_id {
            return Err("Stale recording stop ignored.".into());
        }
    }
    {
        let mut is_recording = state.is_recording.lock().unwrap();
        if !*is_recording {
            return Err("Recording already stopped.".into());
        }
        *is_recording = false;
    }
    CAPTURE_ACTIVE.store(false, Ordering::SeqCst);
    tokio::time::sleep(std::time::Duration::from_millis(40)).await;

    let raw = AUDIO_BUFFER.lock().unwrap().clone();
    let rate = *DEVICE_SAMPLE_RATE.lock().unwrap();

    if raw.len() < 800 {
        if duration_ms > 1000 {
            return Err("Microphone access appears blocked. Enable microphone access for desktop apps in Windows Privacy settings, then try again.".into());
        } else {
            return Err("Recording too short. Hold to talk.".into());
        }
    }

    let samples = trim_voice_activity(&raw, rate)
        .ok_or_else(|| "No speech detected.".to_string())?;
    let mut samples = resample_to_16k(&samples, rate);
    let recorded_duration_ms = duration_ms.max(((samples.len() as i64 * 1000) / 16000).max(1));

    // Normalize only after VAD so silence/noise is not amplified into hallucinations.
    let mut max_amp: f32 = 0.0;
    for &s in samples.iter() {
        if s.abs() > max_amp { max_amp = s.abs(); }
    }
    if max_amp > 0.0 && max_amp < 0.8 {
        let factor = 0.8 / max_amp;
        for s in samples.iter_mut() {
            *s *= factor;
        }
    }


    // Save WAV for history playback
    let wav_fname = format!("rec_{}.wav", chrono::Utc::now().timestamp_millis());
    let wav_path  = recordings_dir().join(&wav_fname);
    save_wav(&wav_path, &samples, 16000).ok();
    let audio_path = wav_path.to_string_lossy().to_string();

    let (text, source) = transcribe(&samples, &state, &wav_path, &app_handle, access_token).await?;
    let text = if source == "parakeet" {
        normalize_technical_transcript(&text)
    } else {
        text
    };

    if text.trim().is_empty() {
        return Err("No speech detected.".into());
    }

    // Filter common Whisper-Large-v3 hallucinations on silent or noisy audio
    let lower_text = text.trim().to_lowercase();
    let is_hallucination = lower_text == "you" 
        || lower_text == "you." 
        || lower_text == "thank you" 
        || lower_text == "thank you."
        || lower_text == "thanks"
        || lower_text == "thanks."
        || lower_text == "bye"
        || lower_text == "bye.";
        
    if is_hallucination {
        return Err("No speech detected (hallucination filtered).".into());
    }

    // Inject into active app
    let final_text = crate::injection::apply_dictionary(&text)?;
    crate::injection::inject_text(&final_text)?;

    // Save to history
    let wc = final_text.split_whitespace().count() as i64;
    crate::db::DB_CONN.lock().unwrap().execute(
        "INSERT INTO history (text, word_count, duration_ms, source, audio_path) VALUES (?,?,?,?,?)",
        rusqlite::params![final_text, wc, recorded_duration_ms, source, audio_path],
    ).ok();
    crate::db::record_lifetime_stats(wc, recorded_duration_ms);
    crate::db::prune_history();

    let complete = TranscriptionComplete {
        text: final_text.clone(),
        word_count: wc,
        duration_ms: recorded_duration_ms,
        source,
    };
    app_handle.emit("transcription-complete", final_text.clone()).ok();
    app_handle.emit("transcription-complete-detail", complete).ok();
    Ok(final_text)
}

/// Transcription strategy:
/// Honors the selected engine: local whisper.cpp or Groq cloud.
async fn transcribe(
    samples: &[f32],
    state: &tauri::State<'_, crate::AppState>,
    wav_path: &std::path::Path,
    app_handle: &tauri::AppHandle,
    access_token: Option<String>,
) -> Result<(String, String), String> {
    let (engine, api_key) = {
        let conn = crate::db::DB_CONN.lock().unwrap();
        let engine = conn.query_row("SELECT value FROM settings WHERE key='engine'", [], |r| r.get::<_,String>(0))
            .unwrap_or_else(|_| "local".into());
        let api_key = conn.query_row("SELECT value FROM settings WHERE key='api_key'", [], |r| r.get::<_,String>(0))
            .ok()
            .and_then(|k| if k.trim().is_empty() { None } else { Some(k) });
        (engine, api_key)
    };

    if engine == "cloud" {
        if let Some(key) = &api_key {
            return crate::transcription::transcribe_via_groq(samples, key).await
                .map(|text| (text, "cloud".into()));
        }
        if let Some(token) = access_token.as_deref().map(str::trim).filter(|token| !token.is_empty()) {
            return crate::transcription::transcribe_via_meshpilot_cloud(samples, token).await
                .map(|text| (text, "cloud".into()));
        }
        return Err("Cloud mode requires a Groq API key in Settings or a MeshPilot sign-in.".to_string());
    }

    // Read language setting
    let mut lang_flag = {
        let conn = crate::db::DB_CONN.lock().unwrap();
        let mode = conn.query_row("SELECT value FROM settings WHERE key='language_mode'", [], |r| r.get::<_,String>(0))
            .unwrap_or_else(|_| "auto".into());
        match mode.as_str() {
            "en" => "en".to_string(),
            "hi" | "hinglish" => "hi".to_string(),
            _ => "auto".to_string(),
        }
    };

    let model_path = state.selected_model.lock().unwrap().clone();
    if let Some(model) = model_path {
        if model.contains("hindi2hinglish") {
            lang_flag = "hi".to_string(); // Force Hindi to bypass slow auto-detection for fine-tuned models
        }
        let model_path = std::path::PathBuf::from(&model);
        if model_path.is_dir() {
            if model_path.file_name().and_then(|n| n.to_str()) == Some("sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8") {
                return transcribe_parakeet(&model_path, wav_path, app_handle).await
                    .map(|text| (text, "parakeet".into()));
            }
            return Err("The selected model is outdated or invalid (e.g. Moonshine). Please open Settings and select a valid Whisper model.".into());
        }


        use tauri::Manager;
        
        let mut bundled = None;
        if let Ok(res_dir) = app_handle.path().resource_dir() {
            let bin_name = if cfg!(target_os = "windows") { "whisper-cli.exe" } else { "whisper-cli" };
            let path = res_dir.join("bin").join("whisper").join(bin_name);
            if path.exists() { bundled = Some(path); }
        }

        // Fallback check for dev layout just in case
        if bundled.is_none() {
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    let bin_name = if cfg!(target_os = "windows") { "whisper-cli.exe" } else { "whisper-cli" };
                    let path_dev = dir.join("..").join("..").join("bin").join("whisper").join(bin_name);
                    if path_dev.exists() { bundled = Some(path_dev); }
                }
            }
        }

        if let Some(bin) = bundled {
            return transcribe_subprocess(&bin.to_string_lossy(), &model, wav_path, &lang_flag).await
                .map(|text| (text, "local".into()));
        }

        // Fallback to PATH
        let whisper = ["whisper-cli", "whisper", "whisper.exe", "whisper-cli.exe"]
            .iter()
            .find(|&&b| which_in_path(b));
        if let Some(bin) = whisper {
            return transcribe_subprocess(bin, &model, wav_path, &lang_flag).await
                .map(|text| (text, "local".into()));
        }
    }

    Err("Local mode requires a downloaded Whisper model. Open Settings and download Base, Tiny, or another model.".into())
}

pub(crate) async fn transcribe_subprocess(bin: &str, model: &str, wav: &std::path::Path, language: &str) -> Result<String, String> {
    let log_path = dirs::data_local_dir()
        .map(|p| p.join("MeshVoice").join("whisper_diag.log"));

    if let Some(ref lp) = log_path {
        let _ = std::fs::create_dir_all(lp.parent().unwrap());
        let log_content = format!(
            "[{:?}] RUNNING WHISPER-CLI\n  bin: {}\n  model: {}\n  wav: {:?}\n  lang: {}\n  current_dir: {:?}\n\n",
            chrono::Utc::now(), bin, model, wav, language, std::path::Path::new(bin).parent()
        );
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(lp)
            .and_then(|mut f| {
                use std::io::Write;
                let _ = f.write_all(log_content.as_bytes());
                Ok(())
            });
    }

    let mut command = tokio::process::Command::new(bin);
    command.kill_on_drop(true);

    // Set working directory to the binary's directory so dependent DLLs (ggml.dll, whisper.dll, SDL2.dll) are found on Windows
    let bin_path = std::path::Path::new(bin);
    if let Some(dir) = bin_path.parent() {
        if !dir.as_os_str().is_empty() {
            command.current_dir(dir);
        }
    }
    command
        .args(&[
            "-m", model,
            "-f", wav.to_str().unwrap_or(""),
            "--no-timestamps",
            "--beam-size", "1",
            "--best-of", "1",
            "--threads", "4",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Only pass -l when we have a real language code; whisper-cli has no "auto" option.
    if language != "auto" && !language.is_empty() {
        command.args(&["-l", language]);
    }
    // The fine-tuned Hinglish models hallucinate if given a prompt. Only prompt standard models.
    if language == "hi" && !model.contains("hindi2hinglish") {
        command.args(&["--prompt", "Haan bhai, this is a Hinglish sentence, theek hai?"]);
    }

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output_res = command.output().await;

    if let Some(ref lp) = log_path {
        let log_content = match &output_res {
            Ok(output) => {
                format!(
                    "[{:?}] COMPLETED\n  status: {}\n  stdout: {}\n  stderr: {}\n\n",
                    chrono::Utc::now(),
                    output.status,
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                )
            }
            Err(e) => {
                format!("[{:?}] SPAWN ERROR: {}\n\n", chrono::Utc::now(), e)
            }
        };
        let _ = std::fs::OpenOptions::new()
            .append(true)
            .open(lp)
            .and_then(|mut f| {
                use std::io::Write;
                let _ = f.write_all(log_content.as_bytes());
                Ok(())
            });
    }

    let output = output_res.map_err(|e| format!("whisper-cli error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("whisper-cli exited with status {}", output.status)
        } else {
            format!("whisper-cli failed: {}", stderr)
        });
    }

    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    let clean = raw.lines()
        .filter(|l| !l.trim().is_empty() && !l.trim().starts_with('['))
        .collect::<Vec<_>>().join(" ");
    Ok(clean.trim().to_string())
}


async fn transcribe_parakeet(model_dir: &std::path::Path, wav: &std::path::Path, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let encoder = model_dir.join("encoder.int8.onnx");
    let decoder = model_dir.join("decoder.int8.onnx");
    let joiner  = model_dir.join("joiner.int8.onnx");
    let tokens  = model_dir.join("tokens.txt");
    for path in [&encoder, &decoder, &joiner, &tokens] {
        if !path.exists() {
            return Err("Parakeet V3 model files are incomplete. Download Parakeet V3 again from Settings.".into());
        }
    }

    // Locate the bundled sherpa-onnx-offline.exe from the Tauri resource directory.
    // The DLLs (sherpa-onnx-c-api.dll, onnxruntime.dll, onnxruntime_providers_shared.dll)
    // are in the same directory and Windows finds them automatically via current_dir.
    use tauri::Manager;
    let sherpa_dir = app_handle.path().resource_dir()
        .map_err(|e| format!("Cannot locate resource dir: {}", e))?
        .join("bin")
        .join("sherpa");
    let bin_name = if cfg!(target_os = "windows") { "sherpa-onnx-offline.exe" } else { "sherpa-onnx-offline" };
    let runtime = sherpa_dir.join(bin_name);
    if !runtime.exists() {
        return Err(format!(
            "Parakeet runtime not found at {}. Reinstall MeshVoice.",
            runtime.display()
        ));
    }

    let mut command = tokio::process::Command::new(&runtime);
    command
        .current_dir(&sherpa_dir)   // DLLs are here — Windows finds them automatically
        .arg(format!("--tokens={}", tokens.to_string_lossy()))
        .arg(format!("--encoder={}", encoder.to_string_lossy()))
        .arg(format!("--decoder={}", decoder.to_string_lossy()))
        .arg(format!("--joiner={}", joiner.to_string_lossy()))
        .arg("--model-type=nemo_transducer")
        .arg("--num-threads=4")
        .arg("--provider=cpu")
        .arg("--decoding-method=greedy_search")
        .arg("--print-args=false")
        .arg(wav)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().await
        .map_err(|e| format!("Parakeet runtime error: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            format!("Parakeet exited with status {}", output.status)
        } else {
            format!("Parakeet failed: {}", stderr)
        });
    }

    let cleaned = parse_parakeet_output(&stdout);
    if cleaned.is_empty() {
        return Err(if stderr.is_empty() {
            "Parakeet V3 produced no transcript. Try again with clearer speech or redownload the model from Settings.".into()
        } else {
            format!("Parakeet V3 produced no transcript: {}", truncate_for_error(&stderr))
        });
    }

    Ok(cleaned)
}



fn parse_parakeet_output(stdout: &str) -> String {
    let mut parts = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if should_ignore_parakeet_line(trimmed) {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
            let mut values = Vec::new();
            collect_transcript_text(&json, &mut values);
            for value in values {
                let normalized = normalize_transcript_text(&value);
                if !normalized.is_empty() {
                    parts.push(normalized);
                }
            }
            continue;
        }

        let normalized = normalize_transcript_text(strip_parakeet_prefix(trimmed));
        if !normalized.is_empty() {
            parts.push(normalized);
        }
    }

    normalize_transcript_text(&parts.join(" "))
}

fn should_ignore_parakeet_line(line: &str) -> bool {
    if line.is_empty() {
        return true;
    }
    let lower = line.to_ascii_lowercase();
    lower.starts_with("started")
        || lower.starts_with("creating")
        || lower.starts_with("offline")
        || lower.starts_with("loading")
        || lower.starts_with("using")
        || lower.starts_with("num threads")
        || lower.contains("elapsed")
        || lower.contains("-->")
        || lower.contains("sherpa-onnx")
        || lower.contains("onnxruntime")
}

fn collect_transcript_text(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                collect_transcript_text(item, out);
            }
        }
        serde_json::Value::Object(map) => {
            for key in ["text", "transcript", "sentence", "result"] {
                if let Some(text) = map.get(key).and_then(|v| v.as_str()) {
                    out.push(text.to_string());
                }
            }
            for key in ["segments", "results", "hypotheses", "items"] {
                if let Some(child) = map.get(key) {
                    collect_transcript_text(child, out);
                }
            }
        }
        _ => {}
    }
}

fn strip_parakeet_prefix(line: &str) -> &str {
    let mut value = line.trim();
    if let Some((prefix, after_colon)) = value.rsplit_once(':') {
        if prefix.ends_with(".wav") || prefix.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ' ') {
            value = after_colon.trim();
        }
    }
    if value.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        value = value.split_once(' ').map(|(_, rest)| rest.trim()).unwrap_or(value);
    }
    value
}

fn normalize_transcript_text(text: &str) -> String {
    text
        .chars()
        .filter(|c| !c.is_control() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn normalize_technical_transcript(text: &str) -> String {
    let mut normalized = normalize_transcript_text(text);
    let replacements = [
        (r"(?i)\bstreaming ASN architecture\b", "streaming ASR architecture"),
        (r"(?i)\bAS and architecture\b", "ASR architecture"),
        (r"(?i)\bA S N architecture\b", "ASR architecture"),
        (r"(?i)\bShepa Unex\b", "Sherpa-ONNX"),
        (r"(?i)\bSherpa Unex\b", "Sherpa-ONNX"),
        (r"(?i)\bShepa ONNX\b", "Sherpa-ONNX"),
        (r"(?i)\bSherpa ONNX\b", "Sherpa-ONNX"),
        (r"(?i)\bShepa Onyx\b", "Sherpa-ONNX"),
        (r"(?i)\bSherpa Onyx\b", "Sherpa-ONNX"),
        (r"(?i)\bstreaming Zformer\b", "streaming Zipformer"),
        (r"(?i)\bZformer\b", "Zipformer"),
        (r"(?i)\bZip former\b", "Zipformer"),
        (r"(?i)\bTransduer\b", "Transducer"),
        (r"(?i)\bINT eight\b", "INT8"),
        (r"(?i)\bfull audio chart\b", "full audio chunks"),
        (r"(?i)\baudio chart\b", "audio chunks"),
    ];

    for (pattern, replacement) in replacements {
        if let Ok(regex) = regex::Regex::new(pattern) {
            normalized = regex.replace_all(&normalized, replacement).to_string();
        }
    }

    normalized
}

fn truncate_for_error(text: &str) -> String {
    const MAX_CHARS: usize = 240;
    let normalized = normalize_transcript_text(text);
    if normalized.chars().count() <= MAX_CHARS {
        return normalized;
    }
    let mut truncated = normalized.chars().take(MAX_CHARS).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn which_in_path(bin: &str) -> bool {
    std::env::var("PATH").ok().map_or(false, |path|
        std::env::split_paths(&path).any(|dir|
            dir.join(bin).exists() || dir.join(format!("{}.exe", bin)).exists()
        )
    )
}

fn format_microphone_error(prefix: &str, error: impl std::fmt::Display) -> String {
    format!(
        "{}: {}. Enable microphone access for desktop apps in Windows Privacy settings, confirm the selected input device is active, then retry.",
        prefix,
        error
    )
}

pub(crate) fn resample_to_16k(input: &[f32], from: u32) -> Vec<f32> {
    if from == 16000 { return input.to_vec(); }
    let ratio = from as f64 / 16000.0;
    let out_len = (input.len() as f64 / ratio) as usize;
    (0..out_len).map(|i| {
        let src = i as f64 * ratio;
        let lo = src.floor() as usize;
        let hi = (lo + 1).min(input.len() - 1);
        input[lo] * (1.0 - (src - lo as f64) as f32) + input[hi] * (src - lo as f64) as f32
    }).collect()
}

fn trim_voice_activity(input: &[f32], rate: u32) -> Option<Vec<f32>> {
    if input.is_empty() {
        return None;
    }

    let frame = ((rate as usize * 30) / 1000).max(1);
    let preroll = ((rate as usize * PREROLL_MS) / 1000).max(frame);
    let min_speech_frames = (MIN_SPEECH_MS / 30).max(1);
    let trailing_silence_frames = (TRAILING_SILENCE_MS / 30).max(1);
    let frame_rms: Vec<f32> = input
        .chunks(frame)
        .map(|chunk| (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt())
        .collect();

    if frame_rms.is_empty() {
        return None;
    }

    let noise_sample_count = ((300 / 30).max(1) as usize).min(frame_rms.len());
    let mut noise = frame_rms[..noise_sample_count].to_vec();
    noise.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let noise_floor = noise[noise.len() / 2];
    let start_threshold = START_RMS_THRESHOLD.max(noise_floor * 2.2);
    let end_threshold = END_RMS_THRESHOLD.max(noise_floor * 1.5);

    let mut speech_start = None;
    let mut speech_end = None;
    let mut speech_frames = 0usize;
    for (idx, rms) in frame_rms.iter().copied().enumerate() {
        if speech_start.is_none() {
            if rms >= start_threshold {
                speech_frames += 1;
                if speech_frames >= min_speech_frames {
                    let start_frame = idx.saturating_sub(speech_frames - 1);
                    speech_start = Some(start_frame * frame);
                    speech_end = Some(((idx + 1) * frame).min(input.len()));
                }
            } else {
                speech_frames = 0;
            }
            continue;
        }

        if rms >= end_threshold {
            speech_end = Some(((idx + 1) * frame).min(input.len()));
        }
    }

    if speech_start.is_none() {
        let rms = (input.iter().map(|s| s * s).sum::<f32>() / input.len() as f32).sqrt();
        let peak = input.iter().fold(0.0_f32, |max, s| max.max(s.abs()));
        if input.len() >= rate as usize / 3 && rms >= 0.0025 && peak >= 0.012 {
            return Some(input.to_vec());
        }
    }

    let start = speech_start?.saturating_sub(preroll);
    let trailing = trailing_silence_frames * frame;
    let end = speech_end?.saturating_add(trailing).min(input.len());
    if end <= start {
        return None;
    }

    Some(input[start..end].to_vec())
}

pub(crate) fn save_wav(path: &std::path::Path, samples: &[f32], rate: u32) -> std::io::Result<()> {
    use std::io::Write;
    let ds = (samples.len() * 2) as u32;
    let mut f = std::fs::File::create(path)?;
    f.write_all(b"RIFF")?; f.write_all(&(36+ds).to_le_bytes())?;
    f.write_all(b"WAVEfmt ")?; f.write_all(&16u32.to_le_bytes())?;
    f.write_all(&1u16.to_le_bytes())?; f.write_all(&1u16.to_le_bytes())?;
    f.write_all(&rate.to_le_bytes())?; f.write_all(&(rate*2).to_le_bytes())?;
    f.write_all(&2u16.to_le_bytes())?; f.write_all(&16u16.to_le_bytes())?;
    f.write_all(b"data")?; f.write_all(&ds.to_le_bytes())?;
    for &s in samples { f.write_all(&((s.clamp(-1.,1.)*32767.) as i16).to_le_bytes())?; }
    Ok(())
}

pub fn start_level_emitter(app: tauri::AppHandle, is_recording: Arc<Mutex<bool>>) {
    std::thread::spawn(move || {
        let mut was_recording = false;
        loop {
            let rec = *is_recording.lock().unwrap();
            if rec {
                was_recording = true;
                let rms = (*LAST_RMS.lock().unwrap()).max(0.02).clamp(0., 1.);
                let shape = [0.5f32, 0.7, 0.9, 1.0, 0.9, 0.7, 0.5];
                let levels: Vec<f32> = shape.iter().map(|&s| (rms * s).clamp(0., 1.)).collect();
                let _ = app.emit("audio-levels", levels);
                std::thread::sleep(std::time::Duration::from_millis(60));
            } else {
                if was_recording {
                    // Reset the visualizer levels exactly once when transitioning to idle.
                    let _ = app.emit("audio-levels", vec![0.0f32; 7]);
                    was_recording = false;
                }
                // Sleep for a longer duration when inactive to avoid lock contention
                // and WebView2 IPC flooding, ensuring a lightweight idle state.
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        }
    });
}




#[cfg(test)]
mod tests {
    use super::{normalize_technical_transcript, parse_parakeet_output, trim_voice_activity};

    #[test]
    fn parakeet_parser_extracts_plain_text() {
        let output = "Started!\n0 hello from parakeet\nElapsed seconds: 1.2";
        assert_eq!(parse_parakeet_output(output), "hello from parakeet");
    }

    #[test]
    fn parakeet_parser_extracts_json_text() {
        let output = r#"{"lang":"en","text":"hello world","tokens":[1,2,3]}"#;
        assert_eq!(parse_parakeet_output(output), "hello world");
    }

    #[test]
    fn parakeet_parser_ignores_runtime_logs() {
        let output = "Creating recognizer\nOfflineRecognizerConfig\nC:\\tmp\\rec.wav: ship clean code";
        assert_eq!(parse_parakeet_output(output), "ship clean code");
    }

    #[test]
    fn parakeet_parser_extracts_text_from_large_json_payload() {
        let output = r#"{"text":"this is a longer dictation that should survive token heavy parakeet output","tokens":["▁this","▁is","▁a","▁longer"],"timestamps":[0.08,0.16,0.24],"log_probs":[-0.1,-0.2,-0.3],"segments":[{"start":0,"end":3,"tokens":[1,2,3,4]}]}"#;
        assert_eq!(
            parse_parakeet_output(output),
            "this is a longer dictation that should survive token heavy parakeet output"
        );
    }

    #[test]
    fn technical_normalizer_repairs_common_asr_terms() {
        assert_eq!(
            normalize_technical_transcript("Use streaming ASN architecture for real time transcription instead of reprocessing full audio chart."),
            "Use streaming ASR architecture for real time transcription instead of reprocessing full audio chunks."
        );
        assert_eq!(
            normalize_technical_transcript("You Shepa Unex Streaming Zformer."),
            "You Sherpa-ONNX streaming Zipformer."
        );
    }

    #[test]
    fn vad_keeps_speech_after_natural_pause() {
        let rate = 16_000;
        let mut samples = Vec::new();
        samples.extend(std::iter::repeat(0.0).take(rate / 5));
        samples.extend(std::iter::repeat(0.06).take(rate));
        samples.extend(std::iter::repeat(0.0).take(rate / 2));
        samples.extend(std::iter::repeat(0.06).take(rate));
        samples.extend(std::iter::repeat(0.0).take(rate / 5));

        let trimmed = trim_voice_activity(&samples, rate as u32).expect("speech should be detected");
        assert!(
            trimmed.len() >= rate * 2,
            "VAD must preserve speech after internal pauses; got {} samples",
            trimmed.len()
        );
    }
}
