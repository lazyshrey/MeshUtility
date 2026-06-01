import { useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { builtInPromptActions } from "../lib";
import { ActionIcon, type SettingsState } from "./PromptCommon";

export function ActionsView({ settings, saveSettings }: { settings: SettingsState; saveSettings: (patch: Partial<SettingsState>) => Promise<void> }) {
  const [selectedActionId, setSelectedActionId] = useState<string>(
    settings.defaultActionId || builtInPromptActions[0]?.id || ""
  );

  const selectedAction = useMemo(() => {
    return builtInPromptActions.find((a) => a.id === selectedActionId) || builtInPromptActions[0];
  }, [selectedActionId]);

  const actionDetails = useMemo(() => {
    if (!selectedAction) return null;
    try {
      const buildResult = selectedAction.build({
        selectedText: "[Selected Source Text]",
        documentText: "",
        userInstruction: "[Optional Instructions]",
        settings,
      });
      const systemPrompt = typeof buildResult.messages.find((m) => m.role === "system")?.content === "string" 
        ? (buildResult.messages.find((m) => m.role === "system")?.content as string) 
        : "";
      const userPrompt = typeof buildResult.messages.find((m) => m.role === "user")?.content === "string" 
        ? (buildResult.messages.find((m) => m.role === "user")?.content as string) 
        : "";

      const options = buildResult.options || {};
      const temperature = options.temperature ?? 0.35;
      const maxOutputTokens = options.maxOutputTokens ?? 1800;

      let tempDescription = "Balanced / Professional";
      if (temperature <= 0.2) {
        tempDescription = "High Precision / Deterministic";
      } else if (temperature >= 0.4) {
        tempDescription = "Creative / Expressive";
      }

      return {
        systemPrompt,
        userPrompt,
        temperature,
        maxOutputTokens,
        tempDescription,
      };
    } catch (e) {
      console.error("Failed to build action details", e);
      return null;
    }
  }, [selectedAction, settings]);

  const isActiveDefault = settings.defaultActionId === selectedActionId;

  const handleActivateAction = async () => {
    await saveSettings({ defaultActionId: selectedActionId });
  };

  return (
    <div className="actions-layout">
      {/* 1. Enhance Prompt Mode on the Top */}
      <section className="card stack">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Enhance Prompt Mode</span>
            <h3>Enhancement Output Depth</h3>
          </div>
        </div>
        <div className="stack" style={{ gap: '8px' }}>
          <select
            value={settings.enhancePromptMode}
            onChange={(e) => void saveSettings({ enhancePromptMode: e.target.value as SettingsState["enhancePromptMode"] })}
            style={{
              background: 'rgba(16, 16, 16, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '0 36px 0 12px',
              height: '38px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="auto" style={{ background: '#1c1c1c' }}>Auto (Scales based on task complexity)</option>
            <option value="concise" style={{ background: '#1c1c1c' }}>Concise (Compact & focused output)</option>
            <option value="structured" style={{ background: '#1c1c1c' }}>Structured (Well-organized system output)</option>
            <option value="detailed" style={{ background: '#1c1c1c' }}>Detailed (Comprehensive details)</option>
          </select>
          <span className="helper-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Sets the scope depth specifically when using the "Enhance Prompt" transformation engine.
          </span>
        </div>
      </section>

      {/* 2. Active Transformation Card */}
      <section className="card stack">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Transformation Selector</span>
            <h3>Active Transformation</h3>
          </div>
        </div>
        
        <div className="stack" style={{ gap: '12px' }}>
          <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Select Transformation Mode</label>
          <select
            value={selectedActionId}
            onChange={(e) => setSelectedActionId(e.target.value)}
            style={{
              background: 'rgba(16, 16, 16, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '0 36px 0 12px',
              height: '38px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {builtInPromptActions.map((action) => (
              <option key={action.id} value={action.id} style={{ background: '#1c1c1c', color: 'var(--text-primary)' }}>
                {action.label}
              </option>
            ))}
          </select>
          <span className="helper-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Choose a transformation mode above to inspect its active directives, configure parameters, and toggle system default status.
          </span>
        </div>
        {selectedAction && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="action-icon-wrapper" style={{ width: '36px', height: '36px', borderRadius: '8px' }}>
                  <ActionIcon actionId={selectedAction.id} />
                </div>
                <div>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{selectedAction.label}</strong>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{selectedAction.description}</p>
                </div>
              </div>

              <button
                className="primary"
                disabled={isActiveDefault}
                onClick={() => void handleActivateAction()}
                style={{ height: '32px', padding: '0 12px', borderRadius: '6px', fontSize: '11.5px', flexShrink: 0, cursor: 'pointer' }}
              >
                {isActiveDefault ? (
                  <>
                    <CheckCircle2 size={11} /> Active Default
                  </>
                ) : (
                  <>
                    <Sparkles size={11} /> Set as Active Default
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 3. Enhance Prompt System Prompt (Custom Transformation details) */}
      {selectedActionId === "custom-instruction" && actionDetails && (
        <section className="card stack" style={{ gap: '16px' }}>
          <div className="card-heading">
            <div>
              <span className="eyebrow">Custom Configuration</span>
              <h3>Custom Directives & Parameters</h3>
            </div>
          </div>
          
          <div className="directives-section" style={{ gap: '8px' }}>
            <h4 className="action-profile-title" style={{ fontSize: '10px' }}>Custom Instruction Token Limit</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="tag" style={{ fontSize: '11px', color: 'var(--accent)', borderColor: 'rgba(242, 106, 75, 0.3)', background: 'rgba(242, 106, 75, 0.05)' }}>
                Max output: {actionDetails.maxOutputTokens} tokens
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Configures the maximum response ceiling for custom distillation output.
              </span>
            </div>
          </div>

          {actionDetails.systemPrompt && (
            <div className="directives-section" style={{ marginTop: '8px' }}>
              <h4 className="action-profile-title" style={{ fontSize: '10px' }}>System Instructions (Directives)</h4>
              <div className="directives-code-container">
                <div className="directives-code-header">
                  <span>system instructions (read-only)</span>
                  <span>custom-instruction</span>
                </div>
                <div className="directives-code-body" style={{ maxHeight: '180px' }}>
                  {actionDetails.systemPrompt}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
