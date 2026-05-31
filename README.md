<div align="center">

<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="72" height="72" rx="16" fill="#0F0F0F"/>
  <rect x="1" y="1" width="70" height="70" rx="15" stroke="#2A2A2A" stroke-width="1"/>
  <circle cx="36" cy="32" r="9" stroke="#F26A4B" stroke-width="2" fill="none"/>
  <rect x="33" y="24" width="6" height="16" rx="3" fill="#F26A4B"/>
  <path d="M22 34c0 7.732 6.268 14 14 14s14-6.268 14-14" stroke="#F26A4B" stroke-width="2" stroke-linecap="round"/>
  <line x1="36" y1="48" x2="36" y2="54" stroke="#F26A4B" stroke-width="2" stroke-linecap="round"/>
  <line x1="28" y1="54" x2="44" y2="54" stroke="#F26A4B" stroke-width="2" stroke-linecap="round"/>
</svg>

# MeshUtility

**A native desktop utility for AI-powered voice dictation and prompt enhancement.**  
Built with Tauri, React, and Rust. Works offline with local Whisper models or online via Groq and OpenAI APIs.

---

<svg width="640" height="380" viewBox="0 0 640 380" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="380" rx="12" fill="#0C0C0C"/>
  <!-- Sidebar -->
  <rect x="0" y="0" width="200" height="380" rx="12" fill="#121212"/>
  <rect x="200" y="0" width="1" height="380" fill="#222"/>
  <!-- Sidebar header -->
  <rect x="16" y="16" width="18" height="18" rx="4" fill="#F26A4B" opacity="0.9"/>
  <rect x="40" y="20" width="80" height="8" rx="3" fill="#555"/>
  <!-- Nav group 1 -->
  <rect x="16" y="54" width="60" height="6" rx="2" fill="#333"/>
  <rect x="12" y="70" width="176" height="30" rx="6" fill="#1E1E1E"/>
  <rect x="24" y="79" width="12" height="12" rx="2" fill="#444"/>
  <rect x="44" y="81" width="70" height="8" rx="3" fill="#666"/>
  <rect x="12" y="106" width="176" height="30" rx="6" fill="transparent"/>
  <rect x="24" y="115" width="12" height="12" rx="2" fill="#333"/>
  <rect x="44" y="117" width="80" height="8" rx="3" fill="#444"/>
  <!-- Nav group 2 -->
  <rect x="16" y="150" width="80" height="6" rx="2" fill="#333"/>
  <rect x="12" y="166" width="176" height="30" rx="6" fill="transparent"/>
  <rect x="24" y="175" width="12" height="12" rx="2" fill="#333"/>
  <rect x="44" y="177" width="90" height="8" rx="3" fill="#444"/>
  <rect x="12" y="202" width="176" height="30" rx="6" fill="transparent"/>
  <rect x="24" y="211" width="12" height="12" rx="2" fill="#333"/>
  <rect x="44" y="213" width="70" height="8" rx="3" fill="#444"/>
  <!-- Bottom brand -->
  <rect x="12" y="320" width="176" height="50" rx="8" fill="#161616"/>
  <rect x="20" y="332" width="24" height="24" rx="6" fill="#F26A4B" opacity="0.2"/>
  <rect x="20" y="332" width="24" height="24" rx="6" stroke="#F26A4B" stroke-width="1" fill="none"/>
  <rect x="52" y="337" width="72" height="8" rx="3" fill="#555"/>
  <rect x="52" y="350" width="48" height="6" rx="2" fill="#333"/>
  <!-- Main content -->
  <rect x="216" y="20" width="120" height="10" rx="4" fill="#333"/>
  <!-- History items -->
  <rect x="216" y="46" width="408" height="60" rx="8" fill="#161616"/>
  <rect x="232" y="58" width="280" height="9" rx="3" fill="#555"/>
  <rect x="232" y="74" width="180" height="7" rx="3" fill="#2A2A2A"/>
  <rect x="544" y="58" width="64" height="7" rx="3" fill="#222"/>
  <rect x="216" y="116" width="408" height="60" rx="8" fill="#161616"/>
  <rect x="232" y="128" width="240" height="9" rx="3" fill="#555"/>
  <rect x="232" y="144" width="160" height="7" rx="3" fill="#2A2A2A"/>
  <rect x="544" y="128" width="64" height="7" rx="3" fill="#222"/>
  <rect x="216" y="186" width="408" height="60" rx="8" fill="#161616"/>
  <rect x="232" y="198" width="300" height="9" rx="3" fill="#555"/>
  <rect x="232" y="214" width="200" height="7" rx="3" fill="#2A2A2A"/>
  <rect x="544" y="198" width="64" height="7" rx="3" fill="#222"/>
  <!-- Stats row -->
  <rect x="216" y="260" width="128" height="70" rx="8" fill="#161616"/>
  <rect x="232" y="275" width="50" height="12" rx="4" fill="#F26A4B" opacity="0.6"/>
  <rect x="232" y="295" width="80" height="7" rx="3" fill="#333"/>
  <rect x="356" y="260" width="128" height="70" rx="8" fill="#161616"/>
  <rect x="372" y="275" width="40" height="12" rx="4" fill="#F26A4B" opacity="0.4"/>
  <rect x="372" y="295" width="70" height="7" rx="3" fill="#333"/>
  <rect x="496" y="260" width="128" height="70" rx="8" fill="#161616"/>
  <rect x="512" y="275" width="60" height="12" rx="4" fill="#F26A4B" opacity="0.3"/>
  <rect x="512" y="295" width="90" height="7" rx="3" fill="#333"/>
</svg>

*MeshUtility — Voice Dictation History and Dashboard*

</div>

---

## Overview

MeshUtility is a free and open-source desktop application that brings together two tools into a single tray-resident utility:

- **Voice Dictation** — Transcribe speech into any text field using a configurable hotkey. Supports local Whisper models (offline), Groq Whisper API, and a built-in parakeet model for high accuracy.
- **Prompt Enhancer** — Transform rough input into polished prompts using Groq, OpenAI, or any OpenAI-compatible provider. Includes a floating overlay that captures selected text and streams an enhanced version back.

The app runs silently in the system tray and exposes a small floating widget for visual feedback while recording.

---

## Features

### Voice Dictation
- Push-to-talk or toggle recording modes
- Configurable global hotkey (default: `Alt+Space`)
- Local offline transcription via whisper.cpp and sherpa-onnx
- Cloud transcription via Groq Whisper API
- Custom pronunciation dictionary for domain-specific terms
- Full transcription history with duration and word counts
- Microphone selection and sensitivity control
- Hinglish and multilingual partial transcription preview

### Prompt Enhancer
- AI-powered prompt rewriting with streaming output
- Support for Groq, OpenAI, Anthropic, Google Gemini, Mistral, and custom OpenAI-compatible endpoints
- Prompt action library with community templates
- Floating overlay window activated by a global shortcut
- Prompt action history log
- Model selection and temperature control per provider

### System
- Runs as a system tray icon with low resource usage
- Custom borderless window with drag support
- Launch at startup support
- Close to tray behavior
- Floating pill widget with animated state transitions
- Auto-update check via GitHub Releases
- SQLite-backed history and settings (local, never synced)

---

## Screenshots

<div align="center">

<svg width="640" height="400" viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="400" rx="12" fill="#0C0C0C"/>
  <!-- Sidebar -->
  <rect x="0" y="0" width="200" height="400" rx="12" fill="#121212"/>
  <rect x="200" y="0" width="1" height="400" fill="#222"/>
  <rect x="16" y="16" width="18" height="18" rx="4" fill="#F26A4B" opacity="0.9"/>
  <rect x="40" y="20" width="80" height="8" rx="3" fill="#555"/>
  <rect x="16" y="60" width="60" height="5" rx="2" fill="#333"/>
  <rect x="12" y="74" width="176" height="28" rx="6" fill="#1E1E1E"/>
  <rect x="24" y="83" width="10" height="10" rx="2" fill="#F26A4B" opacity="0.7"/>
  <rect x="42" y="85" width="60" height="6" rx="2" fill="#888"/>
  <rect x="12" y="110" width="176" height="28" rx="6" fill="none"/>
  <rect x="24" y="119" width="10" height="10" rx="2" fill="#333"/>
  <rect x="42" y="121" width="80" height="6" rx="2" fill="#444"/>
  <!-- Main Prompt Enhancer view -->
  <rect x="216" y="20" width="408" height="200" rx="10" fill="#161616"/>
  <!-- Textarea mockup -->
  <rect x="228" y="30" width="384" height="120" rx="6" fill="#0F0F0F"/>
  <rect x="238" y="42" width="200" height="8" rx="3" fill="#333"/>
  <rect x="238" y="56" width="280" height="8" rx="3" fill="#333"/>
  <rect x="238" y="70" width="160" height="8" rx="3" fill="#333"/>
  <!-- Enhance button -->
  <rect x="228" y="162" width="120" height="32" rx="8" fill="#F26A4B"/>
  <rect x="252" y="172" width="72" height="10" rx="3" fill="white" opacity="0.9"/>
  <rect x="358" y="162" width="80" height="32" rx="8" fill="#1E1E1E"/>
  <rect x="370" y="172" width="56" height="10" rx="3" fill="#555"/>
  <!-- Output area -->
  <rect x="216" y="232" width="408" height="148" rx="10" fill="#161616"/>
  <rect x="228" y="244" width="50" height="6" rx="2" fill="#F26A4B" opacity="0.6"/>
  <rect x="228" y="258" width="370" height="8" rx="3" fill="#444"/>
  <rect x="228" y="272" width="340" height="8" rx="3" fill="#444"/>
  <rect x="228" y="286" width="360" height="8" rx="3" fill="#444"/>
  <rect x="228" y="300" width="200" height="8" rx="3" fill="#444"/>
  <rect x="228" y="330" width="80" height="26" rx="6" fill="#1E1E1E"/>
  <rect x="238" y="338" width="60" height="8" rx="3" fill="#555"/>
  <rect x="318" y="330" width="80" height="26" rx="6" fill="#1E1E1E"/>
  <rect x="328" y="338" width="60" height="8" rx="3" fill="#555"/>
</svg>

*Prompt Enhancer — input, enhance, and copy to clipboard*

---

<svg width="320" height="60" viewBox="0 0 320 60" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="60" rx="30" fill="rgba(16,16,16,0.96)"/>
  <rect x="0.5" y="0.5" width="319" height="59" rx="29.5" stroke="#F26A4B" stroke-width="1"/>
  <!-- Pulsing dot -->
  <circle cx="28" cy="30" r="5" fill="#F26A4B" opacity="0.9"/>
  <!-- Waveform bars -->
  <rect x="44" y="18" width="4" height="24" rx="2" fill="#F26A4B" opacity="0.8"/>
  <rect x="52" y="22" width="4" height="16" rx="2" fill="#F26A4B" opacity="0.6"/>
  <rect x="60" y="15" width="4" height="30" rx="2" fill="#F26A4B" opacity="0.9"/>
  <rect x="68" y="20" width="4" height="20" rx="2" fill="#F26A4B" opacity="0.7"/>
  <rect x="76" y="24" width="4" height="12" rx="2" fill="#F26A4B" opacity="0.5"/>
  <rect x="84" y="17" width="4" height="26" rx="2" fill="#F26A4B" opacity="0.85"/>
  <rect x="92" y="21" width="4" height="18" rx="2" fill="#F26A4B" opacity="0.65"/>
  <rect x="100" y="14" width="4" height="32" rx="2" fill="#F26A4B" opacity="0.95"/>
  <rect x="108" y="22" width="4" height="16" rx="2" fill="#F26A4B" opacity="0.6"/>
  <rect x="116" y="19" width="4" height="22" rx="2" fill="#F26A4B" opacity="0.75"/>
  <text x="134" y="34" font-family="'DM Sans', sans-serif" font-size="12" font-weight="500" fill="#F26A4B">Listening</text>
  <text x="208" y="34" font-family="'JetBrains Mono', monospace" font-size="10" fill="rgba(242,106,75,0.5)">2.4s</text>
  <!-- Ripple ring -->
  <rect width="320" height="60" rx="30" fill="none" stroke="#F26A4B" stroke-width="0.5" opacity="0.2"/>
</svg>

*Floating pill widget in listening state — appears over any app while recording*

</div>

---

## Prerequisites

| Requirement | Version |
|---|---|
| Rust | 1.77 or later |
| Node.js | 20 or later |
| Tauri CLI | 2.x (`cargo install tauri-cli`) |
| Windows | 10 or later (primary target) |

> macOS and Linux are partially supported. Some audio backend features (CPAL device selection) may behave differently.

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/Jenesh11/MeshUtility.git
cd MeshUtility
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Configure API keys

MeshUtility stores all API keys locally in an encrypted SQLite database using the system keychain. No keys are transmitted except to the provider endpoint you configure.

You can set API keys from within the app under **AI Providers** once it is running. For voice transcription, a Groq API key is only required if you choose cloud mode. Local Whisper works without any API key.

To use the Groq cloud transcription engine, obtain a free API key at [console.groq.com](https://console.groq.com).

### 4. Download a Whisper model

Launch the app and navigate to **Voice Settings**. Select a model from the built-in model list and click Download. Models are stored in your local app data directory.

The recommended starting model is `whisper-small.en` for English-only use, or `whisper-base` for multilingual support.

---

## Development

```bash
# Start the Tauri dev server (Vite + Rust hot-reload)
npm run tauri dev

# Type-check the frontend only
npx tsc --noEmit

# Lint
npm run lint
```

---

## Building a release

```bash
npm run tauri build
```

The installer and portable binary are placed in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
MeshUtility/
├── src/                        # React + TypeScript frontend
│   ├── App.tsx                 # Main window shell and sidebar navigation
│   ├── WidgetApp.tsx           # Floating pill widget entry point
│   ├── components/
│   │   ├── Dashboard.tsx       # Dictation history and stats
│   │   ├── Settings.tsx        # Voice settings, hotkey, model, microphone
│   │   ├── PromptApp.tsx       # Prompt enhancer full UI
│   │   ├── Widget.tsx          # Pill widget state machine
│   │   ├── DictionaryEditor.tsx
│   │   └── ResultPopup.tsx
│   ├── store/
│   │   └── appStore.ts         # Zustand state for recording and history
│   ├── lib/                    # Prompt enhancer logic (actions, client, types)
│   └── styles-prompt.css       # Design tokens and component styles
├── src-tauri/                  # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs             # App setup, commands, tray, shortcuts
│   │   ├── audio.rs            # CPAL audio capture and level emission
│   │   ├── transcription.rs    # Whisper and sherpa-onnx inference
│   │   ├── db.rs               # SQLite history, settings, dictionary
│   │   ├── injection.rs        # Text injection via clipboard and enigo
│   │   └── clipboard.rs        # Clipboard read/write with canary detection
│   └── tauri.conf.json         # Window config, deep-link schemes, icons
├── public/                     # Static assets (icons, fonts)
├── index.html                  # Main window HTML entry
├── widget.html                 # Widget window HTML entry
└── overlay.html                # Overlay window HTML entry
```

---

## Configuration Reference

All settings are persisted in a local SQLite database in the app data directory. They can be changed at runtime from the settings panel.

| Setting | Description | Default |
|---|---|---|
| Hotkey | Global shortcut to start/stop recording | `Alt+Space` |
| Recording mode | `push-to-talk` or `toggle` | `push-to-talk` |
| Transcription engine | `local` (whisper.cpp) or `cloud` (Groq) | `local` |
| Selected model | Downloaded whisper model file | none |
| Language mode | `auto`, `en`, `hi`, or other ISO codes | `auto` |
| Sensitivity | Microphone gain multiplier 0–1 | `0.5` |
| Groq API key | Required for cloud transcription | — |
| Prompt provider | `groq`, `openai`, `anthropic`, `gemini`, `mistral`, `custom` | `groq` |
| Prompt model | Model ID for the selected provider | `llama-3.1-8b-instant` |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Space` | Start or stop voice recording (configurable) |
| `Ctrl+Shift+Space` | Open the prompt enhancer overlay |
| `Escape` | Dismiss the overlay or result popup |
| `Ctrl+Enter` | Enhance the current prompt (in the overlay) |
| `Ctrl+C` | Copy enhanced output to clipboard |

All shortcuts are configurable from within the app.

---

## Supported Providers

| Provider | Transcription | Prompt Enhancement |
|---|---|---|
| Groq | Yes (Whisper via API) | Yes |
| OpenAI | No | Yes |
| Anthropic | No | Yes |
| Google Gemini | No | Yes |
| Mistral | No | Yes |
| Custom (OpenAI-compatible) | No | Yes |
| Local Whisper | Yes (offline) | No |

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss the proposed change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Commit your changes with a clear message
4. Open a pull request against `main`

Please follow the existing code style. TypeScript code uses standard React patterns without additional state libraries beyond Zustand. Rust code follows the existing module structure.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Tauri](https://tauri.app) — the framework that makes native desktop apps with web frontends possible
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — fast C++ inference for OpenAI Whisper
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) — ONNX-based speech recognition for the Parakeet model
- [Groq](https://groq.com) — ultra-fast LLM and Whisper inference API
