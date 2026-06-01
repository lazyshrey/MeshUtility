import { Settings, Keyboard, Shield } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Toggle, type SettingsState, fallbackSettings } from "./PromptCommon";

export function SettingsView({ settings, saveSettings }: { settings: SettingsState; saveSettings: (patch: Partial<SettingsState>) => Promise<void> }) {
  return (
    <div className="stack" style={{ maxWidth: '800px', margin: '0 auto', gap: '24px', padding: '16px 24px' }}>
      <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '20px', marginBottom: '8px' }}>
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
      <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }} />

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
            <div className="premium-shortcut-container" style={{ display: 'flex', gap: '10px' }}>
              <input
                className="shortcut-input"
                value={settings.shortcut}
                onChange={(event) => void saveSettings({ shortcut: event.target.value })}
                style={{
                  flex: 1,
                  background: 'rgba(16, 16, 16, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '0 12px',
                  height: '38px',
                  color: 'var(--text-primary)',
                }}
                placeholder="Press keys to bind..."
              />
              <button 
                onClick={() => void saveSettings({ shortcut: fallbackSettings.shortcut })}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '0 16px',
                  cursor: 'pointer',
                  height: '38px',
                  color: 'var(--text-primary)',
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
      <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }} />

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
