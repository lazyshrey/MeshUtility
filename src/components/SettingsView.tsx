import React, { useRef, useState } from "react";
import { Settings, Keyboard, Shield } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Toggle, type SettingsState, fallbackSettings } from "./PromptCommon";

function HotkeyRecorder({ value, onChange, settings }: { value: string; onChange: (v: string) => void; settings: SettingsState }) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const startCapture = async () => {
    setCapturing(true);
    try {
      await invoke("unregister_global_shortcut");
      await invoke("set_paused", { paused: true });
    } catch (e) {
      console.error("Failed to unregister global shortcut:", e);
    }
  };

  const stopCapture = async (combo?: string) => {
    setCapturing(false);
    if (combo) {
      onChange(combo);
    }
    try {
      await invoke("reregister_global_shortcut");
      await invoke("set_paused", { paused: settings.paused });
    } catch (e) {
      console.error("Failed to reregister global shortcut:", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Super");

    const k = e.code.replace("Key", "").replace("Digit", "");
    const isModifier = ["Control", "Alt", "Shift", "Meta"].includes(e.key);

    if (isModifier) {
      setError("Waiting for a non-modifier key...");
      return;
    }

    parts.push(k === "Space" ? "Space" : k.length === 1 ? k.toUpperCase() : k);
    const combo = parts.join("+");

    if (parts.length === 1) {
      setError("Please include at least one modifier (e.g. Alt+Space)");
      return;
    }

    setError("");
    void stopCapture(combo);
    (document.activeElement as HTMLElement)?.blur();
  };

  const keys = value.split("+").filter(Boolean);
  return (
    <div style={{ width: "100%" }}>
      <div
        ref={ref}
        tabIndex={0}
        onFocus={() => { void startCapture(); }}
        onBlur={() => { void stopCapture(); }}
        onKeyDown={capturing ? handleKeyDown : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          cursor: "pointer",
          outline: "none",
          background: capturing ? "color-mix(in oklab, var(--primary) 8%, var(--card))" : "var(--card)",
          border: `1px solid ${capturing ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 10,
          transition: "all 0.15s ease",
          minHeight: "42px",
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {keys.map((k, i) => (
            <span
              key={i}
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "3px 9px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
              }}
            >
              {k}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {capturing ? "Press keys…" : "Click to change"}
        </span>
      </div>
      {error && <p style={{ color: "#ef4444", fontSize: 11, marginTop: 5, margin: "5px 0 0 0" }}>{error}</p>}
    </div>
  );
}

export function SettingsView({ settings, saveSettings }: { settings: SettingsState; saveSettings: (patch: Partial<SettingsState>) => Promise<void> }) {
  return (
    <div className="stack" style={{ maxWidth: '800px', margin: '0 auto', gap: '24px', padding: '16px 24px' }}>
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '8px' }}>
        <span className="eyebrow">Enhancer Settings</span>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={18} style={{ color: 'var(--accent)' }} /> Enhancer Configuration
        </h2>
      </div>

      {/* Section 1: System Orchestration */}
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Settings size={14} style={{ color: 'var(--accent)' }} />
          <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>System Orchestration</h4>
        </div>
        <div className="stack" style={{ gap: '4px' }}>
          <Toggle label="Launch at startup" checked={settings.launchAtStartup} onChange={(launchAtStartup) => void saveSettings({ launchAtStartup })} />
          <Toggle label="Run in tray" checked={settings.runInTray} onChange={(runInTray) => void saveSettings({ runInTray })} />
          <Toggle label="Minimize/close window to tray" checked={settings.closeToTray} onChange={(closeToTray) => void saveSettings({ closeToTray })} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderBottom: '1px solid var(--border)' }} />

      {/* Section 2: Shortcuts & Bindings */}
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Keyboard size={14} style={{ color: 'var(--accent)' }} />
          <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Shortcuts & Bindings</h4>
        </div>
        <div className="stack" style={{ gap: '16px' }}>
          <div className="slider-control-group" style={{ padding: 0 }}>
            <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
              Global Activation Shortcut
            </label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <HotkeyRecorder
                  value={settings.shortcut}
                  onChange={(combo) => void saveSettings({ shortcut: combo })}
                  settings={settings}
                />
              </div>
              <button 
                onClick={async () => {
                  await saveSettings({ shortcut: fallbackSettings.shortcut });
                }}
                className="shortcut-reset-btn"
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '0 16px',
                  cursor: 'pointer',
                  height: '42px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <Toggle label="Temporarily pause bindings" checked={settings.paused} onChange={async (paused) => { await invoke("set_paused", { paused }); await saveSettings({ paused }); }} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderBottom: '1px solid var(--border)' }} />

      {/* Section 3: Data Privacy */}
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Shield size={14} style={{ color: 'var(--accent)' }} />
          <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Data Privacy</h4>
        </div>
        <div className="stack" style={{ gap: '4px' }}>
          <Toggle label="Restore clipboard after paste operations" checked={settings.restoreClipboard} onChange={(restoreClipboard) => void saveSettings({ restoreClipboard })} />
          <Toggle label="Enable history logs" checked={settings.historyEnabled} onChange={(historyEnabled) => void saveSettings({ historyEnabled })} />
          <Toggle label="Sensitive data masking mode" checked={settings.sensitiveMode} onChange={(sensitiveMode) => void saveSettings({ sensitiveMode })} />
        </div>
      </div>
    </div>
  );
}
