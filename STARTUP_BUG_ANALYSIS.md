# MeshUtility — Startup Failure Analysis

_Generated 2026-06-01. Symptom: built app will not start — no window, no crash log, no Task Manager process._
_This version is corrected against the full current source (HEAD = `e486f72`, v1.0.2)._

## TL;DR

The release binary is compiled with `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
([main.rs:1](src-tauri/src/main.rs)). In the **windowed** subsystem there is **no console and no stderr**,
so **any panic during startup kills the process silently** — which is exactly your symptom: no log, and the
process is gone before you can catch it in Task Manager. `npm run tauri dev` compiles in the *console*
subsystem (debug), so the same panic would print to the terminal there.

**That asymmetry is the whole mystery.** The build isn't doing something different — it's *hiding* the error
the dev console would have shown. So step one is to make the crash observable; then the culprit is a one-line
read.

## Startup panic points in the CURRENT code (silent in release)

| # | Location | Code | Panics when |
|---|----------|------|-------------|
| 1 | [db.rs:11](src-tauri/src/db.rs) | `Connection::open(path).expect("Failed to open SQLite database")` | SQLite file can't be opened (corrupt DB, locked, perms). First hit via `db::init_db()` at the top of `setup()`. |
| 2 | [db.rs:16](src-tauri/src/db.rs) etc. | `DB_CONN.lock().unwrap()` | mutex poisoned (i.e. after some other panic) |
| 3 | [main.rs:1136](src-tauri/src/main.rs) | `db::DB_CONN.lock().unwrap()` in `setup()` | same |
| 4 | [main.rs:1390](src-tauri/src/main.rs) | `.run(generate_context!()).expect("error while running tauri application")` | the Tauri runtime fails to start — **most notably when the WebView2 runtime is missing** |

The `TrayIconBuilder` icon unwrap that the previous fix (`e6d2d45`) targeted is now safe
([main.rs:1322](src-tauri/src/main.rs): `if let Some(icon) = app.default_window_icon()`), so it is **not**
the current cause.

### Leading hypothesis

For "no window, no log, **and the process is not even in Task Manager**," the strongest single candidate is
**#4 + a missing WebView2 runtime**:

- Commit `5a0dc02` removed `webviewInstallMode: "offlineInstaller"`. The installer now defaults to
  `downloadBootstrapper`, so the WebView2 runtime is **not** bundled.
- On a machine without WebView2, Tauri's `.run()` fails and `.expect(...)` panics → silent exit in the
  windowed subsystem → precisely your symptom.
- **Caveat:** your own Windows 11 box already has WebView2, so this will *not* reproduce locally. It will hit
  end users who install the release. If "the build won't start" means "on my machine too," the cause is more
  likely a startup panic (#1) or an unhandled error in `setup()` than WebView2.

This is why the plan below makes the panic observable *first* rather than guessing.

## Secondary findings (real, but not the startup crash)

1. **Two different data directories.** `db.rs` stores the SQLite DB under
   `…\AppData\Local\MeshVoice\meshvoice.sqlite` ([db.rs:8-10](src-tauri/src/db.rs)), while settings/keys in
   `main.rs` use `app_local_data_dir()` = `…\AppData\Local\com.meshpilot.meshutility\`
   ([main.rs:125-135](src-tauri/src/main.rs)). State is split across two folders. Not a crash, but messy and
   a migration hazard.

2. **Version drift.** `Cargo.toml` = `meshvoice 0.2.3`; `tauri.conf.json`/`package.json` = `1.0.2`; the tray
   menu hardcodes `"MeshUtility Suite v1.0.1"` ([main.rs:1272](src-tauri/src/main.rs)). Cosmetic, but
   confusing for release/update tracking (the updater compares `package_info().version`).

3. **Prompt Enhancer is Groq-locked.** `proxy_request` rejects any non-Groq URL
   ([main.rs:426](src-tauri/src/main.rs)) even though the README and `src/lib` advertise OpenAI/Anthropic/
   Gemini/etc. In the packaged app the multi-provider UI will fail for everything but Groq.

4. **Dead Vite alias.** `vite.config.ts` aliases `@meshpilot/auth` → `../shared/auth`, which does not exist.
   Nothing in `src/` imports it, so it's harmless today — a leftover from the `meshpilot` monorepo this was
   extracted from. Worth deleting to avoid future confusion.

5. **Whisper/sherpa sidecars _are_ bundled** via `resources: ["bin/whisper/*","bin/sherpa/*"]` in
   `tauri.windows.conf.json` — so offline transcription should ship. (Correcting an earlier note.)

## Environment status (verified)

| Tool | Version | Status |
|------|---------|--------|
| Node | v22.21.0 | OK |
| npm | 10.9.4 | OK |
| rustc | 1.94.0 | OK |
| cargo | 1.94.0 | OK |
| `node_modules` | present (~170 pkgs) | **installed OK** (vite, react, @tauri-apps/cli, typescript all present) |
| `dist/` | missing | normal — produced by `npm run build` |
| `src-tauri/target/` | missing | first build will be slow |

The package.json dependency versions resolve and install cleanly — no manifest fix needed.

## Fix plan

**Phase 0 — reproduce in dev (in progress):** `npm run tauri dev`. If it crashes, the debug console names the
line immediately. If it runs fine in dev, the bug is release-only (points to #4 / WebView2 / windowed-subsystem
panic hiding).

**Phase 1 — make the crash visible:** add `std::panic::set_hook` at the very top of `main()` that appends the
panic message + location to `…\AppData\Local\MeshUtility\startup.log`, plus a `MessageBoxW` in release builds
so a failed launch is never silent. (Or add `tauri-plugin-log`.)

**Phase 2 — reproduce in release:** `npm run tauri build`, run the packaged exe, read `startup.log` → exact
failing line.

**Phase 3 — harden:** convert the startup `expect`/`unwrap` sites (#1–#4) to graceful handling with a
user-facing error dialog; restore `webviewInstallMode: "offlineInstaller"` (or `embedBootstrapper`) for
distributables; unify the two data directories; reconcile versions.

**Phase 4 — verify:** rebuild and launch; ideally test on a clean VM without WebView2.
