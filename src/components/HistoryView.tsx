import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { EmptyState, type HistoryItem } from "./PromptCommon";

export function HistoryView({
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
        
        <button disabled={items.length === 0} onClick={() => void onClear()} style={{ width: '100%', marginTop: 'auto', cursor: 'pointer' }}>
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
                <button onClick={() => onUse(selected)} style={{ cursor: 'pointer' }}>Send to Editor</button>
                <button className="primary" onClick={() => void handleCopy(selected.output)} style={{ cursor: 'pointer' }}>
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
