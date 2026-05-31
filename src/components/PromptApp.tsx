import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CheckCircle2,
  Copy,
  History,
  KeyRound,
  Keyboard,
  Maximize2,
  Minus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Wand2,
  X,
  AlignLeft,
  Maximize,
  Edit2,
  Code,
  Box,
  Bug,
  Mail,
  List,
  FileText,
  Terminal as TerminalIcon,
  Eye,
  EyeOff,
  Download,
  Cpu,
} from "lucide-react";
import {
  MeshPromptClient,
  MeshPromptProviderError,
  builtInPromptActions,
  buildPromptActionRequest,
  getMeshPromptProvider,
  meshPromptProviders,
  type MeshPromptProviderId,
} from "../lib";

type View = "text" | "providers" | "actions" | "history" | "settings";
type OverlayPhase = "picker" | "processing" | "result";

interface ProviderSettings {
  provider: MeshPromptProviderId;
  model: string;
  baseUrl?: string;
}

interface SettingsState {
  provider: ProviderSettings;
  shortcut: string;
  closeToTray: boolean;
  runInTray: boolean;
  launchAtStartup: boolean;
  restoreClipboard: boolean;
  historyEnabled: boolean;
  sensitiveMode: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  defaultActionId: string;
  paused: boolean;
  enhancePromptMode: "auto" | "concise" | "structured" | "detailed";
}

interface HistoryItem {
  id: string;
  actionId: string;
  actionLabel: string;
  provider: MeshPromptProviderId;
  model: string;
  input: string;
  output: string;
  createdAt: string;
}

interface AppState {
  settings: SettingsState;
  history: HistoryItem[];
  keyStatus: Record<string, boolean>;
}

const fallbackSettings: SettingsState = {
  provider: { provider: "groq", model: "llama-3.1-8b-instant" },
  shortcut: "Ctrl+Shift+Space",
  closeToTray: true,
  runInTray: true,
  launchAtStartup: true,
  restoreClipboard: true,
  historyEnabled: true,
  sensitiveMode: false,
  timeoutMs: 60_000,
  maxOutputTokens: 1_800,
  temperature: 0.35,
  defaultActionId: "enhance-prompt",
  paused: false,
  enhancePromptMode: "auto",
};

export default function App() {
  return <MainApp />;
}

export function MainApp({
  embed = false,
  activeView,
  hideSidebar = false,
}: {
  embed?: boolean;
  activeView?: "text" | "providers" | "actions" | "history" | "settings";
  hideSidebar?: boolean;
}) {
  const [state, setState] = useState<AppState>({ settings: fallbackSettings, history: [], keyStatus: {} });
  const [view, setView] = useState<View>("text");

  useEffect(() => {
    if (activeView) {
      setView(activeView);
    }
  }, [activeView]);
  const [selectedText, setSelectedText] = useState("");
  const [output, setOutput] = useState("");
  const [actionId, setActionId] = useState(fallbackSettings.defaultActionId);
  const [instruction, setInstruction] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    version: string;
    changelog: string;
    downloadUrl: string;
  } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    void refreshState();
    void checkUpdates();
    const captureError = listen<string>("meshprompt://capture-error", (event) => {
      setStatus(event.payload ?? "No selected text found.");
      setView("text");
    });
    const openView = listen<View>("meshprompt://open-view", (event) => {
      if (event.payload) {
        setView(event.payload);
      }
    });
    return () => {
      void captureError.then((off) => off());
      void openView.then((off) => off());
    };
  }, []);

  async function checkUpdates() {
    try {
      const result = await invoke<any>("check_for_updates");
      if (result && result.updateAvailable) {
        setUpdateInfo(result);
      }
    } catch (e) {
      console.warn("Failed to check for updates:", e);
    }
  }

  async function triggerUpdate() {
    if (!updateInfo) return;
    setUpdating(true);
    setUpdateError("");
    try {
      await invoke("install_update", { downloadUrl: updateInfo.downloadUrl });
    } catch (e) {
      setUpdating(false);
      setUpdateError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (view === "history") {
      void refreshState();
    }
  }, [view]);

  async function refreshState() {
    try {
      const next = await invoke<AppState>("get_app_state");
      setState(next);
      setActionId(next.settings.defaultActionId);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function saveSettings(patch: Partial<SettingsState>) {
    const settings = { ...state.settings, ...patch };
    setState((current) => ({ ...current, settings }));
    await invoke("save_settings", { settings });
    setStatus("Settings saved");
  }

  async function saveProvider(settings: ProviderSettings) {
    const provider = getMeshPromptProvider(settings.provider);
    const nextProvider = {
      ...settings,
      model: settings.model.trim() || provider.defaultModel,
      baseUrl: settings.baseUrl?.trim() || undefined,
    };
    const next = { ...state.settings, provider: nextProvider };
    setState((current) => ({ ...current, settings: next }));
    await invoke("save_settings", { settings: next });
    setStatus("Provider settings saved");
  }

  async function runAction(sourceText = selectedText, sourceInstruction = instruction) {
    if (!sourceText.trim()) {
      setStatus("Add text to enhance first.");
      return;
    }
    const action = builtInPromptActions.find((item) => item.id === actionId) ?? builtInPromptActions[0];
    setBusy(true);
    setStatus("Enhancing text...");
    try {
      const response = await generateWithCurrentProvider(state.settings, action.id, sourceText, sourceInstruction);
      setOutput(response.content);
      setStatus("Output ready");
      if (state.settings.historyEnabled && !state.settings.sensitiveMode) {
        await invoke("add_history", {
          item: {
            id: crypto.randomUUID(),
            actionId: action.id,
            actionLabel: action.label,
            provider: response.provider,
            model: response.model,
            input: sourceText,
            output: response.content,
            createdAt: new Date().toISOString(),
          },
        });
        await refreshState();
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function captureText() {
    setStatus("Capturing selected text...");
    try {
      const text = await invoke<string>("capture_selected_text");
      setSelectedText(text);
      setStatus("Text captured");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function copyOutput() {
    await invoke("copy_text", { text: output });
    setStatus("Copied");
  }

  async function replaceOutput() {
    try {
      await invoke("replace_selected_text", { text: output });
      setStatus("Replaced selected text");
    } catch (error) {
      await invoke("copy_text", { text: output });
      setStatus(`Replace failed. Copied instead. ${errorMessage(error)}`);
    }
  }

  async function saveKey() {
    const providerId = state.settings.provider.provider;
    const providerDef = getMeshPromptProvider(providerId);
    const label = providerDef.label;

    const trimmedKey = apiKeyDraft.trim().replace(/[\r\n]+/g, "");
    if (!trimmedKey) {
      setStatus(`Add ${providerDef.label} API key first.`);
      return;
    }

    try {
      await invoke("save_provider_key", { provider: providerId, apiKey: trimmedKey });
      await refreshState();
      setStatus(`${label} key saved locally.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function clearKey() {
    const providerId = state.settings.provider.provider;
    const providerDef = getMeshPromptProvider(providerId);
    const label = providerDef.label;

    try {
      await invoke("delete_provider_key", { provider: providerId });
      if (typeof window !== "undefined") {
        localStorage.removeItem(`meshprompt_key_${providerId}`);
      }
      setApiKeyDraft("");
      await refreshState();
      setStatus(`${label} key cleared.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  const activeAction = builtInPromptActions.find((action) => action.id === actionId) ?? builtInPromptActions[0];

  const renderUpdateModal = () => {
    if (!showUpdateModal || !updateInfo) return null;
    return (
      <div className="modal-overlay" onClick={() => !updating && setShowUpdateModal(false)}>
        <div className="modal-content card stack" onClick={(e) => e.stopPropagation()} style={{ width: '420px', padding: '24px' }}>
          <div className="card-heading" style={{ marginBottom: '16px' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--text-accent)' }}>New Version Released</span>
              <h3>MeshPrompt {updateInfo.version}</h3>
            </div>
          </div>
          
          <div className="stack" style={{ gap: '12px', flex: 1, minHeight: 0 }}>
            <label>Release Notes</label>
            <div className="update-changelog">
              {updateInfo.changelog || "No release notes provided."}
            </div>
            
            {updateError && <div className="error-message" style={{ color: 'var(--error)', fontSize: '12px' }}>{updateError}</div>}
            
            {updating ? (
              <div className="stack" style={{ gap: '8px', alignItems: 'center', margin: '16px 0' }}>
                <div className="spinner" />
                <strong>Downloading & Installing...</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>The application will automatically restart once finished.</span>
              </div>
            ) : (
              <div className="button-row" style={{ marginTop: '16px' }}>
                <button className="primary" onClick={triggerUpdate}>Update Now</button>
                <button onClick={() => setShowUpdateModal(false)}>Later</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };


  if (embed) {
    return (
      <div className="meshprompt-theme app-body" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', height: '100%', width: '100%' }}>
        {!hideSidebar && (
          <aside className="sidebar">
            <div className="brand-block">
              <div className="brand-mark">
                <img src="/logo-prompt.png" alt="MP" />
              </div>
              <div>
                <h1 className="brand-name">MeshPrompt</h1>
              </div>
            </div>
            <nav>
              <NavButton active={view === "text"} onClick={() => setView("text")} icon={<Wand2 size={15} />} label="Enhancer" />
              <NavButton active={view === "providers"} onClick={() => setView("providers")} icon={<KeyRound size={15} />} label="Test Provider" />
              <NavButton active={view === "actions"} onClick={() => setView("actions")} icon={<Sparkles size={15} />} label="Prompt Actions" />
              <NavButton active={view === "history"} onClick={() => setView("history")} icon={<History size={15} />} label="Action History" />
              <NavButton active={view === "settings"} onClick={() => setView("settings")} icon={<Settings size={15} />} label="Settings" />
            </nav>
            <div className="sidebar-footer">
              <span>{state.settings.paused ? "Shortcuts paused" : "Tray utility active"}</span>
              <strong>{state.settings.shortcut}</strong>
            </div>
          </aside>
        )}
        <main className="main-panel">
          <section className="content-scroll">
            {view === "text" && (
              <div className="grid-two compact-grid">
                <div className="card stack">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Active Pipeline</span>
                      <h3>{activeAction.label}</h3>
                    </div>
                    <button onClick={captureText}>Capture Selection</button>
                  </div>
                  
                  <div className="stack" style={{ gap: '8px' }}>
                    <label>Transformation Type</label>
                    <select value={actionId} onChange={(event) => setActionId(event.target.value)}>
                      {builtInPromptActions.map((action) => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="stack" style={{ gap: '8px', flex: 1, minHeight: 0 }}>
                    <label>Original Prompt / Text</label>
                    <textarea 
                      value={selectedText} 
                      onChange={(event) => setSelectedText(event.target.value)} 
                      placeholder="Select text anywhere on your device and press Ctrl+Shift+Space, or paste/type text here to improve it." 
                      style={{ flex: 1 }}
                    />
                  </div>

                  <div className="stack" style={{ gap: '8px' }}>
                    <label>Contextual Guidelines / Focus (Optional)</label>
                    <textarea 
                      className="short" 
                      value={instruction} 
                      onChange={(event) => setInstruction(event.target.value)} 
                      placeholder="e.g. rewrite as a clear system instruction, keep it highly technical, use bullet points, etc." 
                    />
                  </div>

                  <div className="button-row">
                    <button className="primary" disabled={busy} onClick={() => void runAction()}>{busy ? "Enhancing..." : "Enhance Prompt"}</button>
                    <button disabled={!output} onClick={() => setOutput("")}>Clear</button>
                  </div>
                </div>
                
                <div className="card stack">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Output Stream ({state.settings.provider.provider} / {state.settings.provider.model})</span>
                      <h3>Enhanced Prompt</h3>
                    </div>
                  </div>
                  
                  <textarea 
                    value={output} 
                    onChange={(event) => setOutput(event.target.value)} 
                    placeholder="Improved prompt text will appear here." 
                    style={{ flex: 1 }}
                  />
                  
                  <div className="button-row">
                    <button className="primary" disabled={!output} onClick={replaceOutput}>Replace Selection</button>
                    <button disabled={!output} onClick={copyOutput}><Copy size={14} /> Copy</button>
                    <button disabled={!selectedText || busy} onClick={() => void runAction()}><RotateCcw size={14} /> Retry</button>
                  </div>
                </div>
              </div>
            )}

            {view === "actions" && <ActionsView settings={state.settings} saveSettings={saveSettings} />}
            
            {view === "providers" && (
              <ProviderView
                state={state}
                apiKeyDraft={apiKeyDraft}
                setApiKeyDraft={setApiKeyDraft}
                saveKey={saveKey}
                clearKey={clearKey}
                saveProvider={(provider) => saveSettings({ ...state.settings, provider })}
                setStatus={setStatus}
              />
            )}

            {view === "history" && (
              <HistoryView
                items={state.history}
                historyEnabled={state.settings.historyEnabled}
                sensitiveMode={state.settings.sensitiveMode}
                onUse={(item) => {
                  setSelectedText(item.input);
                  setOutput(item.output);
                  setActionId(item.actionId);
                  setView("text");
                }}
                onClear={async () => {
                  await invoke("clear_history");
                  await refreshState();
                  setStatus("History cleared");
                }}
              />
            )}

            {view === "settings" && <SettingsView settings={state.settings} saveSettings={saveSettings} />}
          </section>
        </main>
        {renderUpdateModal()}
      </div>
    );
  }

  return (
    <div className="app-shell flex-col">
      <TitleBar status={status} view={view} updateInfo={updateInfo} onUpdateClick={() => setShowUpdateModal(true)} />
      <div className="app-body">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">
              <img src="/logo.png" alt="MP" />
            </div>
            <div>
              <h1 className="brand-name">MeshPrompt</h1>
            </div>
          </div>
          <nav>
            <NavButton active={view === "text"} onClick={() => setView("text")} icon={<Wand2 size={15} />} label="Enhancer" />
            <NavButton active={view === "providers"} onClick={() => setView("providers")} icon={<KeyRound size={15} />} label="Test Provider" />
            <NavButton active={view === "actions"} onClick={() => setView("actions")} icon={<Sparkles size={15} />} label="Prompt Actions" />
            <NavButton active={view === "history"} onClick={() => setView("history")} icon={<History size={15} />} label="Action History" />
            <NavButton active={view === "settings"} onClick={() => setView("settings")} icon={<Settings size={15} />} label="Settings" />
          </nav>
          <div className="sidebar-footer">
            <span>{state.settings.paused ? "Shortcuts paused" : "Tray utility active"}</span>
            <strong>{state.settings.shortcut}</strong>
          </div>
        </aside>
        <main className="main-panel">
          <section className="content-scroll">
            {view === "text" && (
              <div className="grid-two compact-grid">
                <div className="card stack">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Active Pipeline</span>
                      <h3>{activeAction.label}</h3>
                    </div>
                    <button onClick={captureText}>Capture Selection</button>
                  </div>
                  
                  <div className="stack" style={{ gap: '8px' }}>
                    <label>Transformation Type</label>
                    <select value={actionId} onChange={(event) => setActionId(event.target.value)}>
                      {builtInPromptActions.map((action) => (
                        <option key={action.id} value={action.id}>{action.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="stack" style={{ gap: '8px', flex: 1, minHeight: 0 }}>
                    <label>Original Prompt / Text</label>
                    <textarea 
                      value={selectedText} 
                      onChange={(event) => setSelectedText(event.target.value)} 
                      placeholder="Select text anywhere on your device and press Ctrl+Shift+Space, or paste/type text here to improve it." 
                      style={{ flex: 1 }}
                    />
                  </div>

                  <div className="stack" style={{ gap: '8px' }}>
                    <label>Contextual Guidelines / Focus (Optional)</label>
                    <textarea 
                      className="short" 
                      value={instruction} 
                      onChange={(event) => setInstruction(event.target.value)} 
                      placeholder="e.g. rewrite as a clear system instruction, keep it highly technical, use bullet points, etc." 
                    />
                  </div>

                  <div className="button-row">
                    <button className="primary" disabled={busy} onClick={() => void runAction()}>{busy ? "Enhancing..." : "Enhance Prompt"}</button>
                    <button disabled={!output} onClick={() => setOutput("")}>Clear</button>
                  </div>
                </div>
                
                <div className="card stack">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">Output Stream ({state.settings.provider.provider} / {state.settings.provider.model})</span>
                      <h3>Enhanced Prompt</h3>
                    </div>
                  </div>
                  
                  <textarea 
                    value={output} 
                    onChange={(event) => setOutput(event.target.value)} 
                    placeholder="Improved prompt text will appear here." 
                    style={{ flex: 1 }}
                  />
                  
                  <div className="button-row">
                    <button className="primary" disabled={!output} onClick={replaceOutput}>Replace Selection</button>
                    <button disabled={!output} onClick={copyOutput}><Copy size={14} /> Copy</button>
                    <button disabled={!selectedText || busy} onClick={() => void runAction()}><RotateCcw size={14} /> Retry</button>
                  </div>
                </div>
              </div>
            )}

            {view === "actions" && <ActionsView settings={state.settings} saveSettings={saveSettings} />}
            
            {view === "providers" && (
              <ProviderView
                state={state}
                apiKeyDraft={apiKeyDraft}
                setApiKeyDraft={setApiKeyDraft}
                saveKey={saveKey}
                clearKey={clearKey}
                saveProvider={(provider) => saveSettings({ ...state.settings, provider })}
                setStatus={setStatus}
              />
            )}

            {view === "history" && (
              <HistoryView
                items={state.history}
                historyEnabled={state.settings.historyEnabled}
                sensitiveMode={state.settings.sensitiveMode}
                onUse={(item) => {
                  setSelectedText(item.input);
                  setOutput(item.output);
                  setActionId(item.actionId);
                  setView("text");
                }}
                onClear={async () => {
                  await invoke("clear_history");
                  await refreshState();
                  setStatus("History cleared");
                }}
              />
            )}

            {view === "settings" && <SettingsView settings={state.settings} saveSettings={saveSettings} />}
          </section>
        </main>
      </div>

      {renderUpdateModal()}
    </div>
  );
}



export function OverlayApp() {
  const [selectedText, setSelectedText] = useState("");
  const [output, setOutput] = useState("");
  const [query, setQuery] = useState("");
  const [actionId, setActionId] = useState("enhance-prompt");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settings, setSettings] = useState<SettingsState>(fallbackSettings);
  const [phase, setPhase] = useState<OverlayPhase>("picker");
  const [status, setStatus] = useState("Select an action");

  const actions = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return builtInPromptActions.filter((action) =>
      `${action.label} ${action.description} ${action.category}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  const displayedActions = useMemo(() => {
    return actions.filter((a) =>
      ["enhance-prompt", "make-concise", "expand-details", "rewrite-professionally", "developer-prompt", "product-prompt"].includes(a.id)
    );
  }, [actions]);

  const activeAction = displayedActions[selectedIndex] ?? builtInPromptActions.find((action) => action.id === actionId) ?? builtInPromptActions[0];

  useEffect(() => {
    document.body.style.background = "transparent";
    void invoke<AppState>("get_app_state").then((state) => {
      const forcedSettings = {
        ...state.settings,
        provider: {
          provider: "groq" as MeshPromptProviderId,
          model: state.settings.provider.provider === "groq" && state.settings.provider.model
            ? state.settings.provider.model 
            : "llama-3.3-70b-versatile",
          baseUrl: undefined,
        }
      };
      setSettings(forcedSettings);
      setActionId(state.settings.defaultActionId);
    });
    void invoke<string>("get_captured_text").then((text) => {
      if (text) {
        setSelectedText(text);
        setOutput("");
        setPhase("picker");
        setStatus("Text captured");
        void invoke("resize_overlay", { width: 500, height: 230 }).catch(() => {});
      }
    });
    const captured = listen<string>("meshprompt://captured-text", (event) => {
      void invoke<AppState>("get_app_state").then((state) => {
        const forcedSettings = {
          ...state.settings,
          provider: {
            provider: "groq" as MeshPromptProviderId,
            model: state.settings.provider.provider === "groq" && state.settings.provider.model
              ? state.settings.provider.model 
              : "llama-3.3-70b-versatile",
            baseUrl: undefined,
          }
        };
        setSettings(forcedSettings);
        if (!actionId) setActionId(state.settings.defaultActionId);
      });
      setSelectedText(event.payload ?? "");
      setOutput("");
      setPhase("picker");
      setStatus("Text captured");
      void invoke("resize_overlay", { width: 500, height: 230 }).catch(() => {});
    });
    const captureError = listen<string>("meshprompt://capture-error", (event) => {
      setStatus(event.payload ?? "No selected text found. Paste text below.");
      setPhase("picker");
      void invoke("resize_overlay", { width: 500, height: 230 }).catch(() => {});
    });
    return () => {
      void captured.then((off) => off());
      void captureError.then((off) => off());
    };
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        void invoke("hide_overlay");
      }
      if (phase === "picker" && displayedActions.length > 0) {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setSelectedIndex((index) => (index + 1) % displayedActions.length);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setSelectedIndex((index) => (index - 1 + displayedActions.length) % displayedActions.length);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((index) => {
            const nextIndex = index + 3;
            return nextIndex < displayedActions.length ? nextIndex : index;
          });
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((index) => {
            const nextIndex = index - 3;
            return nextIndex >= 0 ? nextIndex : index;
          });
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && output) {
        event.preventDefault();
        void copyOverlayOutput();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && output) {
        event.preventDefault();
        void replaceOverlayOutput();
      } else if (event.key === "Enter" && phase !== "processing") {
        event.preventDefault();
        void runOverlayAction();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayedActions, output, phase, selectedText, settings, activeAction]);

  async function runOverlayAction(nextActionId?: string) {
    const action = nextActionId
      ? builtInPromptActions.find((item) => item.id === nextActionId) ?? activeAction
      : activeAction;
    setActionId(action.id);
    if (!selectedText.trim()) {
      setStatus("Add text to enhance first.");
      return;
    }
    setPhase("processing");
    setStatus(action.label);
    void invoke("resize_overlay", { width: 500, height: 230 }).catch(() => {});
    try {
      const response = await generateWithCurrentProvider(settings, action.id, selectedText);
      
      if (settings.historyEnabled && !settings.sensitiveMode) {
        await invoke("add_history", {
          item: {
            id: crypto.randomUUID(),
            actionId: action.id,
            actionLabel: action.label,
            provider: response.provider,
            model: response.model,
            input: selectedText,
            output: response.content,
            createdAt: new Date().toISOString(),
          },
        });
      }

      try {
        await invoke("hide_overlay");
        await invoke("replace_selected_text", { text: response.content });
      } catch (error) {
        await invoke("show_overlay");
        await invoke("copy_text", { text: response.content });
        setOutput(response.content);
        setPhase("result");
        setStatus(`Replace failed. Copied instead. ${errorMessage(error)}`);
        void invoke("resize_overlay", { width: 500, height: 440 }).catch(() => {});
      }
    } catch (error: any) {
      setPhase("picker");
      let shortError = errorMessage(error);
      const msg = shortError.toLowerCase();
      if (msg.includes("fetch") || msg.includes("network")) shortError = "Network error. Check connection.";
      else if (msg.includes("401") || msg.includes("api key") || msg.includes("unauthorized")) shortError = "Invalid API key.";
      else if (msg.includes("404")) shortError = "Invalid model or endpoint unreachable.";
      setStatus(shortError);
    }
  }

  async function copyOverlayOutput() {
    await invoke("copy_text", { text: output });
    setStatus("Copied");
  }

  async function replaceOverlayOutput() {
    try {
      await invoke("replace_selected_text", { text: output });
      await invoke("hide_overlay");
    } catch (error) {
      await invoke("copy_text", { text: output });
      setStatus(`Replace failed. Copied instead. ${errorMessage(error)}`);
    }
  }

  return (
    <div className="overlay-shell meshprompt-theme">
      <div className="overlay-card">
        <div className="overlay-top" data-tauri-drag-region>
          <div data-tauri-drag-region>
            <span className="eyebrow" data-tauri-drag-region>MESHUTILITY</span>
            <h2 data-tauri-drag-region>{phase === "result" ? "Result" : "Improve selected text"}</h2>
          </div>
          <button className="mac-dot close" data-no-drag onClick={() => invoke("hide_overlay")} aria-label="Close"></button>
        </div>

        {phase !== "result" && (
          <div className="overlay-search-container">
            <Search size={14} className="muted" />
            <input
              autoFocus
              placeholder="Paste text here to enhance..."
              value={selectedText}
              onChange={(e) => setSelectedText(e.target.value)}
              className="overlay-search-input"
            />
          </div>
        )}

        {phase === "picker" && (
          <div className="compact-action-list">
            {displayedActions.map((action, index) => (
              <button
                key={action.id}
                className={index === selectedIndex ? "compact-action active" : "compact-action"}
                title={action.description}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  setSelectedIndex(index);
                  void runOverlayAction(action.id);
                }}
              >
                <ActionIcon actionId={action.id} />
                <strong>{action.id === "rewrite-professionally" ? "Rewrite" : action.id === "developer-prompt" ? "Developer" : action.id === "product-prompt" ? "Product" : action.label}</strong>
              </button>
            ))}
          </div>
        )}

        {phase === "processing" && (
          <div className="processing-state">
            <div className="spinner" />
            <strong>{status}</strong>
            <span>Generating with {settings.provider.provider} / {settings.provider.model}</span>
            <button onClick={() => setPhase("picker")}>Cancel</button>
          </div>
        )}

        {phase === "result" && (
          <>
            <div className="result-preview">{output}</div>
            <div className="overlay-actions">
              <button className="primary" onClick={copyOverlayOutput}>Copy</button>
              <button onClick={replaceOverlayOutput}>Replace</button>
              <button onClick={() => void runOverlayAction()}>Retry</button>
              <button onClick={() => invoke("hide_overlay")}>Close</button>
            </div>
          </>
        )}

        {status && status !== "Select an action" && status !== "Output ready" && (
          <div className="overlay-status short-error-badge">{status}</div>
        )}
      </div>
    </div>
  );
}

function TitleBar({
  status,
  view,
  updateInfo,
  onUpdateClick,
}: {
  status: string;
  view: View;
  updateInfo: { updateAvailable: boolean; version: string } | null;
  onUpdateClick: () => void;
}) {
  const appWindow = getCurrentWindow();
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="title-actions-left" data-tauri-drag-region>
        {status && <div className="status-pill" data-no-drag>{status}</div>}
        {updateInfo?.updateAvailable && (
          <button 
            className="titlebar-update-btn" 
            data-no-drag 
            onClick={onUpdateClick}
            style={{ marginLeft: '8px' }}
            title={`Update Available (${updateInfo.version})`}
            aria-label="Update Available"
          >
            <Download size={11} />
            <span>Update</span>
          </button>
        )}
      </div>
      <div className="title-center" data-tauri-drag-region>
        <span className="title-icon" data-tauri-drag-region>
          <img src="/logo.png" alt="MP" data-tauri-drag-region />
        </span>
        <strong className="title-text" data-tauri-drag-region>MeshPrompt</strong>
      </div>
      <div className="window-controls-right" data-tauri-drag-region>
        <button className="mac-dot minimize" data-no-drag onClick={(e) => { e.stopPropagation(); void appWindow.minimize(); }} aria-label="Minimize"></button>
        <button className="mac-dot maximize" data-no-drag onClick={(e) => { e.stopPropagation(); void appWindow.toggleMaximize(); }} aria-label="Maximize"></button>
        <button className="mac-dot close" data-no-drag onClick={(e) => { e.stopPropagation(); void appWindow.close(); }} aria-label="Close"></button>
      </div>
    </header>
  );
}

function ActionIcon({ actionId }: { actionId: string }) {
  switch (actionId) {
    case "enhance-prompt": return <Sparkles size={14} />;
    case "make-concise": return <AlignLeft size={14} />;
    case "expand-details": return <Maximize size={14} />;
    case "rewrite-professionally": return <Edit2 size={14} />;
    case "developer-prompt": return <Code size={14} />;
    case "product-prompt": return <Box size={14} />;
    case "bug-report": return <Bug size={14} />;
    case "email-rewrite": return <Mail size={14} />;
    case "summarize": return <List size={14} />;
    default: return <FileText size={14} />;
  }
}

interface ConsoleLine {
  type: "sys" | "net" | "err" | "success";
  text: string;
}

function ProviderView(props: {
  state: AppState;
  apiKeyDraft: string;
  setApiKeyDraft: (value: string) => void;
  saveKey: () => Promise<void>;
  clearKey: () => Promise<void>;
  saveProvider: (settings: ProviderSettings) => Promise<void>;
  setStatus: (value: string) => void;
}) {
  const { state, apiKeyDraft, setApiKeyDraft, saveKey, clearKey, saveProvider } = props;
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [saved, setSaved] = useState(false);

  async function handleSaveKeyClick() {
    await saveKey();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  
  const provider = getMeshPromptProvider(state.settings.provider.provider);
  const hasSavedKey = Boolean(state.keyStatus[provider.id]);

  useEffect(() => {
    let active = true;
    async function loadKey() {
      try {
        const key = await invoke<string | null>("get_provider_key", { provider: provider.id });
        if (active) {
          setApiKeyDraft(key ?? "");
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadKey();
    return () => {
      active = false;
    };
  }, [provider.id, setApiKeyDraft]);

  async function testConnection() {
    setTesting(true);
    setConsoleLogs([
      { type: "sys", text: `[SYSTEM] Initializing test sequence for ${provider.label}...` },
      { type: "sys", text: `[SYSTEM] Target Endpoint: ${provider.endpoint.baseUrl}` },
      { type: "sys", text: `[SYSTEM] Resolving API credentials...` }
    ]);
    
    try {
      const key = apiKeyDraft.trim() || (await invoke<string | null>("get_provider_key", { provider: provider.id }));
      if (provider.authMode === "api-key" && !key) {
        throw new Error(`API Key is required for ${provider.label}. Connection aborted.`);
      }
      
      const resolvedModel = state.settings.provider.model || provider.defaultModel;
      const baseUrl = state.settings.provider.baseUrl ?? provider.endpoint.baseUrl;
      
      setConsoleLogs(prev => [
        ...prev,
        { type: "net", text: `[POST] ${baseUrl}${provider.endpoint.chatPath.replace("{model}", resolvedModel)}` },
        { type: "sys", text: `[SYSTEM] Contacting server...` }
      ]);
      
      const startTime = Date.now();
      const client = new MeshPromptClient({
        provider,
        credentials: { apiKey: key ?? undefined, baseUrl: state.settings.provider.baseUrl },
        timeoutMs: Math.min(state.settings.timeoutMs, 20_000),
        appName: "MeshPrompt",
      });

      const response = await client.generate({
        model: resolvedModel,
        messages: [{ role: "user", content: "Reply brief only: Online" }],
        maxOutputTokens: 20,
        temperature: 0,
      });
      
      const latency = Date.now() - startTime;
      
      setConsoleLogs(prev => [
        ...prev,
        { type: "success", text: `[SUCCESS] Connection established successfully in ${latency}ms!` },
        { type: "success", text: `[RESPONSE] "${response.content.trim()}"` },
        { type: "sys", text: `[SYSTEM] Handshake completed successfully.` }
      ]);
    } catch (error: any) {
      const message = error?.message || String(error);
      setConsoleLogs(prev => [
        ...prev,
        { type: "err", text: `[ERROR] Connection failed: ${message}` },
        { type: "sys", text: `[SYSTEM] Connection diagnostics aborted.` }
      ]);
    } finally {
      setTesting(false);
    }
  }

  function getProviderIcon(id: string) {
    let src = "/logo-prompt.png";
    switch (id) {
      case "xai":
        src = "/xai_logo.svg";
        break;
      case "openai":
        src = "/openai_logo.svg";
        break;
      case "anthropic":
        src = "/anthropic_logo.svg";
        break;
      case "gemini":
        src = "/gemini_logo.svg";
        break;
      case "groq":
        src = "/groq_logo.svg";
        break;
      case "openrouter":
        src = "/openrouter_logo.svg";
        break;
      case "ollama":
        src = "/ollama_logo.svg";
        break;
    }
    return (
      <img
        src={src}
        alt=""
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '4px',
          objectFit: 'contain',
        }}
      />
    );
  }

  return (
    <div className="provider-layout">
      <section className="provider-list">
        <span className="eyebrow" style={{ marginBottom: '8px', paddingLeft: '4px' }}>BYOK Providers</span>
        {meshPromptProviders.map((item) => {
          const isSecured = Boolean(state.keyStatus[item.id]);
          return (
            <button
              key={item.id}
              className={item.id === provider.id ? "provider-row active" : "provider-row"}
              onClick={() => saveProvider({ provider: item.id, model: item.defaultModel })}
            >
              <div className="provider-row-icon">
                {getProviderIcon(item.id)}
              </div>
              <div className="provider-row-content">
                <strong>{item.label}</strong>
                <span>{item.authMode === "api-key" ? "Bring your own key" : "Local provider"}</span>
              </div>
              {item.authMode === "api-key" && (
                <div 
                  className={`provider-status-dot ${isSecured ? "secured" : "unconfigured"}`} 
                  title={isSecured ? "API Key Secured" : "API Key Not Configured"}
                />
              )}
            </button>
          );
        })}
      </section>
      
      <section className="card stack glass-config-deck">
        <div className="card-heading" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div>
            <span className="eyebrow">BYOK Provider</span>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{provider.label} Configuration</h3>
          </div>
          {hasSavedKey && <span className="success-chip"><CheckCircle2 size={12} /> Key Secured</span>}
        </div>
        
        <div className="stack" style={{ gap: '8px' }}>
          <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Active Model</label>
          <select
            value={state.settings.provider.model}
            onChange={(event) => saveProvider({ ...state.settings.provider, model: event.target.value })}
            style={{
              background: 'rgba(16, 16, 16, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '10px 14px',
              height: '38px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {provider.models.map((model) => (
              <option key={model.id} value={model.id} style={{ background: '#1c1c1c', color: 'var(--text-primary)' }}>
                {model.label} ({model.id})
              </option>
            ))}
          </select>
        </div>

        {provider.supportsCustomBaseUrl && (
          <div className="advanced-toggle stack" style={{ gap: '8px' }}>
            <button className="link-button" onClick={() => setShowAdvanced(!showAdvanced)} style={{ alignSelf: 'flex-start' }}>
              {showAdvanced ? "Hide Base URL overrides" : "Configure Custom API Base URL"}
            </button>
            {showAdvanced && (
              <div className="advanced-panel stack" style={{ gap: '8px' }}>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Custom Base URL override</label>
                <div className="row-input" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={state.settings.provider.baseUrl ?? ""}
                    onChange={(event) => saveProvider({ ...state.settings.provider, baseUrl: event.target.value })}
                    placeholder={provider.endpoint.baseUrl}
                    style={{
                      flex: 1,
                      background: 'rgba(16, 16, 16, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '0 12px',
                      height: '38px',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button 
                    onClick={() => saveProvider({ ...state.settings.provider, baseUrl: "" })}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '0 16px',
                      cursor: 'pointer',
                      height: '38px',
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {provider.authMode === "api-key" && (
          <div className="stack" style={{ gap: '10px' }}>
            <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>API Key</label>
            <div className="row-input" style={{ position: 'relative', display: 'flex', width: '100%' }}>
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={hasSavedKey ? "••••••••••••••••••••••••••••••••" : `Enter ${provider.label} API Key`}
                style={{
                  flex: 1,
                  background: 'rgba(16, 16, 16, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '0 40px 0 12px',
                  height: '38px',
                  color: 'var(--text-primary)',
                  fontFamily: apiKeyDraft ? "inherit" : "'JetBrains Mono', monospace",
                }}
              />
              <button 
                className="link-button" 
                onClick={() => setShowKey(!showKey)}
                style={{ 
                  position: 'absolute', 
                  right: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  border: 'none', 
                  background: 'transparent',
                  height: 'auto',
                  textDecoration: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Used automatically for prompt distillation and translation.</p>
          </div>
        )}
        
        {provider.authMode === "api-key" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            <button 
              className={saved ? "btn-premium-save-success" : "btn-premium-save"} 
              disabled={!apiKeyDraft.trim()} 
              onClick={handleSaveKeyClick}
              style={{ width: '100%', height: '42px', borderRadius: '10px' }}
            >
              {saved ? "Saved" : "Save settings"}
            </button>
            
            <button 
              className="btn-premium-test" 
              onClick={testConnection} 
              disabled={testing || (!hasSavedKey && !apiKeyDraft.trim())}
              style={{ width: '100%', height: '38px', borderRadius: '8px' }}
            >
              {testing ? "Executing test..." : "Test Connection"}
            </button>
          </div>
        )}

        {provider.authMode !== "api-key" && (
          <div style={{ marginTop: '8px' }}>
            <button 
              className="btn-premium-test" 
              onClick={testConnection} 
              disabled={testing}
              style={{ width: '100%', height: '38px', borderRadius: '8px' }}
            >
              {testing ? "Executing test..." : "Test Connection"}
            </button>
          </div>
        )}

        {consoleLogs.length > 0 && (
          <div className="console-container">
            <div className="console-header">
              <div className="console-title">
                <TerminalIcon size={13} style={{ color: 'var(--accent)' }} />
                <span>Test Terminal Output</span>
              </div>
              <div className={`console-status-indicator ${testing ? "active" : ""}`} />
            </div>
            <div className="console-body">
              {consoleLogs.map((log, idx) => (
                <div key={idx} className={`console-line console-line-${log.type}`}>
                  {log.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ActionsView({ settings, saveSettings }: { settings: SettingsState; saveSettings: (patch: Partial<SettingsState>) => Promise<void> }) {
  return (
    <div className="stack" style={{ maxWidth: '1000px', margin: '0 auto', gap: '20px' }}>
      <section className="card stack">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Enhance Prompt Mode</span>
            <h3>Enhancement Target Output Depth</h3>
          </div>
        </div>
        <div className="stack" style={{ gap: '8px' }}>
          <select value={settings.enhancePromptMode} onChange={(e) => saveSettings({ enhancePromptMode: e.target.value as SettingsState["enhancePromptMode"] })}>
            <option value="auto">Auto (Dynamically scales prompt output depth)</option>
            <option value="concise">Concise (Compact & focused output)</option>
            <option value="structured">Structured (Well-organized system outputs)</option>
            <option value="detailed">Detailed (Comprehensive, rich & multi-faceted details)</option>
          </select>
          <span className="helper-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Configures how the prompt distiller structures improved system parameters.
          </span>
        </div>
      </section>

      <section className="card stack">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Distiller Catalog</span>
            <h3>Active Transformations</h3>
          </div>
        </div>
        <div className="table-list">
          {builtInPromptActions.map((action) => (
            <div key={action.id} className="table-row">
              <div>
                <strong>{action.label}</strong>
                <span>{action.description}</span>
              </div>
              <span className="tag" style={{ justifySelf: 'center' }}>{action.category}</span>
              <span className="tag" style={{ justifySelf: 'center' }}>Built-In</span>
              <button 
                className={settings.defaultActionId === action.id ? "primary" : ""} 
                onClick={() => saveSettings({ defaultActionId: action.id })}
                style={{ justifySelf: 'end' }}
              >
                {settings.defaultActionId === action.id ? "Default" : "Set Default"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HistoryView({
  items,
  historyEnabled,
  sensitiveMode,
  onUse,
  onClear,
}: {
  items: HistoryItem[];
  historyEnabled: boolean;
  sensitiveMode: boolean;
  onUse: (item: HistoryItem) => void;
  onClear: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const disabled = !historyEnabled || sensitiveMode;

  async function handleCopy(text: string) {
    await invoke("copy_text", { text });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.actionLabel.toLowerCase().includes(query) ||
        item.input.toLowerCase().includes(query) ||
        item.output.toLowerCase().includes(query) ||
        item.provider.toLowerCase().includes(query) ||
        item.model.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  useEffect(() => {
    if (filteredItems.length > 0 && !selected) {
      setSelected(filteredItems[0]);
    } else if (filteredItems.length === 0) {
      setSelected(null);
    } else if (selected && !filteredItems.find((i) => i.id === selected.id)) {
      setSelected(filteredItems[0]);
    }
  }, [filteredItems, selected]);

  if (disabled) {
    return (
      <section className="card stack" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Local history</span>
            <h3>History logs disabled</h3>
          </div>
        </div>
        <EmptyState title="History logging is deactivated" body="Sensitive masking mode or general history logging parameters are deactivating this panel." />
      </section>
    );
  }

  return (
    <div className="history-layout">
      <div className="history-sidebar">
        <div className="history-search-container">
          <Search size={14} className="history-search-icon" />
          <input
            placeholder="Filter past runs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="history-list">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`history-item ${selected?.id === item.id ? "active" : ""}`}
              onClick={() => setSelected(item)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '2px' }}>
                <strong>{item.actionLabel}</strong>
                <span className="tag" style={{ border: 'none', background: 'transparent', padding: 0 }}>{item.provider}</span>
              </div>
              <p>{item.output}</p>
              <span style={{ marginTop: '4px' }}>{new Date(item.createdAt).toLocaleDateString()} · {item.model}</span>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No transformation records found.
            </div>
          )}
        </div>
        
        <button disabled={items.length === 0} onClick={onClear} style={{ width: '100%', marginTop: 'auto' }}>
          Clear All History
        </button>
      </div>
      
      <div className="history-detail-panel">
        {selected ? (
          <>
            <div className="history-detail-header">
              <div className="history-detail-meta">
                <h3>{selected.actionLabel}</h3>
                <span>{new Date(selected.createdAt).toLocaleString()} · Model: {selected.model} · Provider: {selected.provider}</span>
              </div>
              <div className="history-detail-actions">
                <button onClick={() => onUse(selected)}>Send to Editor</button>
                <button className="primary" onClick={() => void handleCopy(selected.output)}>
                  {copied ? "Copied!" : "Copy Result"}
                </button>
              </div>
            </div>
            
            <div className="history-detail-content">
              <div className="stack" style={{ gap: '8px' }}>
                <label className="eyebrow">Input prompt / selected text</label>
                <div className="detail-box">{selected.input}</div>
              </div>
              <div className="stack" style={{ gap: '8px', flex: 1, minHeight: 0 }}>
                <label className="eyebrow">Transformed enhanced prompt</label>
                <div className="detail-box output">{selected.output}</div>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="No items selected" body="Select a transformation record from the sidebar list to inspect prompt logs." />
        )}
      </div>
    </div>
  );
}

function SettingsView({ settings, saveSettings }: { settings: SettingsState; saveSettings: (patch: Partial<SettingsState>) => Promise<void> }) {
  return (
    <section className="settings-columns">
      <div className="settings-column-stack">
        <SettingsCard title="System Orchestration" icon={<Settings size={16} />}>
          <Toggle label="Launch at startup" checked={settings.launchAtStartup} onChange={(launchAtStartup) => saveSettings({ launchAtStartup })} />
          <Toggle label="Run in tray" checked={settings.runInTray} onChange={(runInTray) => saveSettings({ runInTray })} />
          <Toggle label="Minimize/close window to tray" checked={settings.closeToTray} onChange={(closeToTray) => saveSettings({ closeToTray })} />
        </SettingsCard>
        
        <SettingsCard title="Data Privacy" icon={<Shield size={16} />}>
          <Toggle label="Restore clipboard after paste operations" checked={settings.restoreClipboard} onChange={(restoreClipboard) => saveSettings({ restoreClipboard })} />
          <Toggle label="Enable history logs" checked={settings.historyEnabled} onChange={(historyEnabled) => saveSettings({ historyEnabled })} />
          <Toggle label="Sensitive data masking mode" checked={settings.sensitiveMode} onChange={(sensitiveMode) => saveSettings({ sensitiveMode })} />
        </SettingsCard>
      </div>
      
      <div className="settings-column-stack">
        <SettingsCard title="Shortcuts & Bindings" icon={<Keyboard size={16} />}>
          <div className="slider-control-group">
            <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Global Activation Shortcut
            </label>
            <div className="premium-shortcut-container">
              <input
                className="shortcut-input"
                value={settings.shortcut}
                onChange={(event) => saveSettings({ shortcut: event.target.value })}
                style={{ flex: 1 }}
                placeholder="Press keys to bind..."
              />
              <button onClick={() => saveSettings({ shortcut: fallbackSettings.shortcut })}>Reset</button>
            </div>
          </div>
          <Toggle label="Temporarily pause bindings" checked={settings.paused} onChange={async (paused) => { await invoke("set_paused", { paused }); await saveSettings({ paused }); }} />
        </SettingsCard>
      </div>
    </section>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function SettingsCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="card stack premium-glass-card">
      <div className="settings-title">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void | Promise<void> }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <div className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={(event) => void onChange(event.target.checked)} />
        <span className="toggle-slider"></span>
      </div>
    </label>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}

async function generateWithCurrentProvider(
  settings: SettingsState,
  actionId: string,
  selectedText: string,
  userInstruction = "",
) {
  // Always enforce Groq for MeshPrompt!
  const providerDef = getMeshPromptProvider("groq");
  const key = await invoke<string | null>("get_provider_key", { provider: "groq" });
  
  if (!key) {
    throw new Error("Groq API Key is not configured. Configure it in Provider Settings.");
  }

  const isGroq = settings.provider.provider === "groq";
  const model = isGroq && settings.provider.model
    ? settings.provider.model
    : "llama-3.3-70b-versatile";

  if (!selectedText.trim()) {
    throw new Error("Add text to enhance first.");
  }

  const action = builtInPromptActions.find((item) => item.id === actionId) ?? builtInPromptActions[0];
  const request = buildPromptActionRequest(action, { selectedText, userInstruction, settings });
  const client = new MeshPromptClient({
    provider: providerDef,
    credentials: { apiKey: key ?? undefined, baseUrl: "https://api.groq.com/openai/v1" },
    timeoutMs: settings.timeoutMs,
    appName: "MeshPrompt",
  });
  return client.generate({
    ...request.options,
    model,
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
    messages: request.messages,
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof MeshPromptProviderError) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "MeshPrompt action failed.";
}
