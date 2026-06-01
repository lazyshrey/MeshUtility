import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'

interface WhisperModel {
  id: string; name: string; description: string; filename: string
  size_mb: number; download_url: string; language: string
  can_translate: boolean; accuracy: number; speed: number; recommended: boolean
  runtime: string
}

interface DLProgress {
  filename: string; progress: number; downloaded_mb: number; total_mb: number
  done: boolean; error: string | null
}

interface MicrophoneStatus {
  available: boolean
  ready: boolean
  selected_device: string | null
  default_device: string | null
  error: string | null
}

// ─── HotkeyRecorder ────────────────────────────────────────────────────────
function HotkeyRecorder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation()
    const parts: string[] = []
    if (e.ctrlKey)  parts.push('Ctrl')
    if (e.altKey)   parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey)  parts.push('Super')

    const k = e.code.replace('Key','').replace('Digit','')
    const isModifier = ['Control','Alt','Shift','Meta'].includes(e.key)

    if (isModifier) {
      setError('Waiting for a non-modifier key...')
      return
    }

    parts.push(k === 'Space' ? 'Space' : k.length === 1 ? k.toUpperCase() : k)
    const combo = parts.join('+')

    if (parts.length === 1) {
      setError('Please include at least one modifier (e.g. Alt+Space)')
      return
    }

    setError(''); onChange(combo); setCapturing(false);
    (document.activeElement as HTMLElement)?.blur()
  }

  const keys = value.split('+').filter(Boolean)
  return (
    <div>
      <div ref={ref} tabIndex={0}
        onFocus={() => setCapturing(true)} onBlur={() => setCapturing(false)}
        onKeyDown={capturing ? handleKeyDown : undefined}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', cursor:'pointer', outline:'none', background: capturing ? 'rgba(242,106,75,0.05)' : 'var(--surface)', border:`1px solid ${capturing ? '#F26A4B' : 'var(--border)'}`, borderRadius:10, transition:'all 0.15s' }}>
        <div style={{ display:'flex', gap:6 }}>
          {keys.map((k,i) => (
            <span key={i} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:5, padding:'3px 9px', fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:'var(--text)' }}>{k}</span>
          ))}
        </div>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{capturing ? 'Press keys…' : 'Click to change'}</span>
      </div>
      {error && <p style={{ color:'#EF4444', fontSize:11, marginTop:5 }}>{error}</p>}
      <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:5 }}>Recommended: Alt+Space or Ctrl+Shift+Space. Applies immediately.</p>
    </div>
  )
}

// ─── BarMeter ───────────────────────────────────────────────────────────────
const BarMeter = ({ value, active }: { value: number; active: boolean }) => (
  <div style={{ width:64, height:3, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
    <div style={{ width:`${value}%`, height:'100%', background: active ? '#F26A4B' : 'var(--text-muted)', borderRadius:2 }} />
  </div>
)

// ─── ModelCard ──────────────────────────────────────────────────────────────
function ModelCard({ model, selected, downloaded, dlProgress, downloading, onDownload, onSelect, loading }:
  { model: WhisperModel; selected: boolean; downloaded: boolean; dlProgress: DLProgress | null; downloading: boolean; onDownload: () => void; onSelect: () => void; loading: boolean }) {
  const size = model.size_mb >= 1000 ? `${(model.size_mb/1000).toFixed(1)} GB` : `${model.size_mb} MB`
  const selectable = downloaded && (model.runtime === 'whisper.cpp' || model.runtime === 'sherpa-onnx')

  return (
    <div onClick={selectable ? onSelect : undefined} style={{
      padding:'14px 16px', borderRadius:10, position:'relative', overflow:'hidden',
      border:`1.5px solid ${selected && downloaded ? 'var(--accent)' : 'var(--border)'}`,
      background: selected && downloaded ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--surface)',
      boxShadow: selected && downloaded ? '0 0 12px rgba(var(--accent-rgb), 0.15)' : 'none',
      cursor: selectable ? 'pointer' : 'default', transition:'all 0.15s',
    }}>
      {/* Download progress bar */}
      {downloading && dlProgress && (
        <div style={{ position:'absolute', left:0, bottom:0, height:2, width:`${dlProgress.progress}%`, background:'var(--accent)', transition:'width 0.2s ease' }} />
      )}
      <div style={{ display:'flex', gap:12 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background: selected && downloaded ? 'var(--accent)' : 'var(--border)', flexShrink:0, marginTop:4, transition:'background 0.15s' }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
            <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{model.name}</span>
            {model.recommended && <span style={{ fontSize:10, background:'rgba(242,106,75,0.15)', color:'#F26A4B', padding:'1px 7px', borderRadius:4 }}>Recommended</span>}
            {(model.id === 'hinglish-turbo' || model.id === 'hinglish-small' || model.id === 'hinglish-apex') && (
              <span style={{ fontSize:10, background:'rgba(242,106,75,0.12)', color:'#F26A4B', padding:'1px 7px', borderRadius:4 }}>Hinglish</span>
            )}
            {loading && selected && <span style={{ fontSize:10, color:'var(--text-muted)' }}>Loading…</span>}
          </div>
          <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 7px', lineHeight:1.4 }}>{model.description}</p>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:4 }}>{model.language}</span>
            <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:4 }}>{model.runtime}</span>
            {model.can_translate && <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:4 }}>Translate to EN</span>}
            {(model.id === 'hinglish-turbo' || model.id === 'hinglish-small' || model.id === 'hinglish-apex') && (
              <span style={{ fontSize:10, color:'#F26A4B', background:'rgba(242,106,75,0.08)', padding:'2px 7px', borderRadius:4 }}>Streaming</span>
            )}
            {(model.id === 'hinglish-turbo' || model.id === 'hinglish-small' || model.id === 'hinglish-apex') && (
              <span style={{ fontSize:10, color:'var(--text-muted)', background:'var(--surface-2)', padding:'2px 7px', borderRadius:4 }}>Local · Offline</span>
            )}
          </div>
          {dlProgress?.error && (
            <div style={{ fontSize:11, color:'#EF4444', marginTop:6 }}>
              Failed: {dlProgress.error}
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10, color:'var(--text-muted)', minWidth:44, textAlign:'right' }}>accuracy</span>
              <BarMeter value={model.accuracy} active={downloaded} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10, color:'var(--text-muted)', minWidth:44, textAlign:'right' }}>speed</span>
              <BarMeter value={model.speed} active={downloaded} />
            </div>
          </div>
          {downloaded ? (
            <span style={{ fontSize:11, color: selectable ? '#4ADE80' : 'var(--text-muted)', marginTop:2 }}>
              {selectable ? 'Downloaded' : 'Downloaded'}
            </span>
          ) : downloading && dlProgress ? (
            <span style={{ fontSize:11, color:'#F26A4B' }}>{dlProgress.downloaded_mb}/{dlProgress.total_mb} MB ({dlProgress.progress}%)</span>
          ) : dlProgress?.error ? (
            <button onClick={(e) => { e.stopPropagation(); onDownload() }} style={{ fontSize:11, color:'#EF4444', background:'none', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, padding:'3px 8px', cursor:'pointer' }}>Retry</button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onDownload() }} style={{ fontSize:11, color:'var(--text-muted)', background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {size}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Settings ───────────────────────────────────────────────────────────────
export function Settings() {
  const [models, setModels] = useState<WhisperModel[]>([])
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('ggml-base.en.bin')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [loadingModel, setLoadingModel] = useState('')
  const [hotkey, setHotkey] = useState('Alt+Space')
  const [mode, setMode] = useState<'push-to-talk'|'toggle'>('push-to-talk')
  const [languageMode, setLanguageMode] = useState<'auto'|'en'|'hi'|'hinglish'>('auto')
  const [sensitivity, setSensitivity] = useState(0.7)
  const [apiKey, setApiKey] = useState('')
  const [mics, setMics] = useState<string[]>([])
  const [selectedMic, setSelectedMic] = useState<string>('')
  const [micStatus, setMicStatus] = useState<MicrophoneStatus | null>(null)
  const [memoryWorkspacePath, setMemoryWorkspacePath] = useState('')
  const [memoryStatus, setMemoryStatus] = useState('')
  const [widgetStyle, setWidgetStyle] = useState<'pill'|'circle'|'invisible'>('pill')
  
  const [saved, setSaved] = useState(false)
  const [dlProgress, setDlProgress] = useState<Record<string, DLProgress>>({})
  const [activeDownload, setActiveDownload] = useState<string|null>(null)

  const refreshDownloaded = () =>
    invoke<string[]>('get_downloaded_models').then(setDownloadedFiles)

  const refreshMicStatus = () =>
    invoke<MicrophoneStatus>('check_microphone_status')
      .then(setMicStatus)
      .catch(e => setMicStatus({ available:false, ready:false, selected_device:null, default_device:null, error:String(e) }))

  useEffect(() => {
    invoke<WhisperModel[]>('get_available_models').then(setModels)
    refreshDownloaded()
    invoke<string[]>('get_audio_devices').then(setMics).catch(console.error)
    refreshMicStatus()
    invoke<string|null>('get_setting', { key:'microphone' }).then(v => { if (v) setSelectedMic(v) })
    invoke<string|null>('get_setting', { key:'hotkey' }).then(v => v && setHotkey(v))
    invoke<string|null>('get_setting', { key:'model'    }).then(v => v && setSelectedModel(v))
    invoke<string|null>('get_setting', { key:'model_id' }).then(v => v && setSelectedModelId(v))
    invoke<string|null>('get_setting', { key:'mode'   }).then(v => {
      if (v === 'push-to-talk' || v === 'toggle') setMode(v)
    })
    invoke<string|null>('get_setting', { key:'sensitivity' }).then(v => v && setSensitivity(+v))
    invoke<string|null>('get_setting', { key:'api_key' }).then(v => v && setApiKey(v))
    invoke<string|null>('get_setting', { key:'memory_workspace_path' }).then(v => v && setMemoryWorkspacePath(v))
    invoke<string|null>('get_setting', { key:'widget_style' }).then(v => {
      if (v === 'pill' || v === 'circle' || v === 'invisible') setWidgetStyle(v)
    })
    invoke<string|null>('get_language_mode').then(v => {
      if (v === 'auto' || v === 'en' || v === 'hi' || v === 'hinglish') setLanguageMode(v)
    })

    const sub = listen<DLProgress>('model-download-progress', e => {
      const p = e.payload
      setDlProgress(prev => ({ ...prev, [p.filename]: p }))
      if (p.done) { setActiveDownload(null); refreshDownloaded() }
    })
    const subLoading = listen<string>('model-loading',  e => setLoadingModel(e.payload))
    const subLoaded  = listen<string>('model-loaded',   () => setLoadingModel(''))
    return () => { sub.then(f=>f()); subLoading.then(f=>f()); subLoaded.then(f=>f()) }
  }, [])

  const handleDownload = (model: WhisperModel) => {
    if (activeDownload) return
    setActiveDownload(model.filename)
    setDlProgress(p => ({ ...p, [model.filename]: { filename: model.filename, progress:0, downloaded_mb:0, total_mb: model.size_mb, done:false, error:null } }))
    invoke('download_model', { filename: model.filename, downloadUrl: model.download_url })
      .catch(e => setDlProgress(p => ({ ...p, [model.filename]: { ...p[model.filename], error: String(e), done: true } })))
      .finally(() => setActiveDownload(null))
  }

  const handleSelect = async (filename: string, modelId?: string) => {
    setSelectedModel(filename)
    setSelectedModelId(modelId ?? '')
    setLoadingModel(filename)
    try { await invoke('load_model', { filename }) }
    catch(e) { console.error(e) }
    finally { setLoadingModel('') }
    await Promise.all([
      invoke('set_setting', { key:'model', value: filename }),
      invoke('set_setting', { key:'model_id', value: modelId ?? '' }),
    ])
    if (modelId === 'hinglish-turbo' || modelId === 'hinglish-small' || modelId === 'hinglish-apex') {
      setLanguageMode('hinglish')
      invoke('set_language_mode', { mode: 'hinglish' }).catch(console.error)
    }
  }

  const save = async () => {
    await Promise.all([
      invoke('set_setting', { key:'hotkey', value: hotkey }),
      invoke('set_recording_mode', { mode }),
      invoke('set_setting', { key:'sensitivity', value: String(sensitivity) }),
      invoke('set_setting', { key:'api_key', value: apiKey }),
      invoke('set_setting', { key:'memory_workspace_path', value: memoryWorkspacePath }),
      invoke('set_setting', { key:'widget_style', value: widgetStyle }),
      invoke('reregister_hotkey', { newHotkey: hotkey }).catch(() => {}),
    ])
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const filteredModels = models.filter(m => {
    const isMulti = m.language.includes('Multi-language') || m.language.includes('25 languages')
    const isEnOnly = m.language === 'English'
    const isHinglish = m.language.includes('Hinglish')

    if (languageMode === 'en') return isEnOnly || isMulti
    if (languageMode === 'hi') return isMulti || isHinglish
    if (languageMode === 'hinglish') return isHinglish || m.id === 'turbo' || m.id === 'small' || m.id === 'base' || m.id === 'tiny'
    if (languageMode === 'auto') return isMulti
    return true
  })

  const downloaded = filteredModels.filter(m => downloadedFiles.includes(m.filename))
  const available  = filteredModels.filter(m => !downloadedFiles.includes(m.filename))

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'24px 32px 48px', display:'flex', flexDirection:'column', gap:28 }}>
      <h2 style={{ fontFamily:"'Instrument Serif',serif", fontSize:24, fontWeight:400, color:'var(--text)', margin:0 }}>Settings</h2>

      {/* Recording mode */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Recording mode</label>
        <div style={{ display:'flex', gap:10 }}>
          {([{ value:'push-to-talk', label:'Push to Talk', desc:'Hold hotkey to record' }, { value:'toggle', label:'Toggle', desc:'Press once to start/stop' }] as const).map(opt => (
            <button key={opt.value} onClick={() => {
              setMode(opt.value)
              invoke('set_recording_mode', { mode: opt.value }).catch(console.error)
            }} style={{ flex:1, padding:'14px 16px', borderRadius:10, textAlign:'left', cursor:'pointer', transition:'all 0.15s', background: mode===opt.value ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--surface)', border:`1.5px solid ${mode===opt.value ? 'var(--accent)' : 'var(--border)'}`, boxShadow: mode===opt.value ? '0 0 12px rgba(var(--accent-rgb), 0.15)' : 'none', fontFamily:"'Noto Sans',sans-serif" }}>
              <div style={{ fontSize:13, fontWeight:600, color: mode===opt.value ? 'var(--accent)' : 'var(--text)', marginBottom:3, transition:'color 0.15s' }}>{opt.label}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Hotkey */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Global hotkey</label>
        <HotkeyRecorder value={hotkey} onChange={(combo) => {
          invoke('reregister_hotkey', { newHotkey: combo })
            .then(() => {
              setHotkey(combo);
              invoke('set_setting', { key:'hotkey', value: combo }).catch(console.error);
            })
            .catch(e => {
              alert(`Could not register hotkey ${combo}. It might be reserved by another app (e.g. PowerToys uses Alt+Space). Error: ${e}`);
            });
        }} />
      </section>

      {/* Widget Style */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Widget Style</label>
        <div style={{ display:'flex', gap:10 }}>
          {([
            { value: 'pill', label: 'Standard Pill', desc: 'Sleek rounded capsule with text' },
            { value: 'circle', label: 'Circular Logo', desc: 'Minimal circular logo only' },
            { value: 'invisible', label: 'Invisible Glass', desc: 'Translucent background with visible text' }
          ] as const).map(opt => (
            <button key={opt.value} onClick={async () => {
              setWidgetStyle(opt.value)
              await invoke('set_setting', { key: 'widget_style', value: opt.value })
              await emit('widget-style-changed', opt.value).catch(console.error)
            }} style={{ flex:1, padding:'14px 16px', borderRadius:10, textAlign:'left', cursor:'pointer', transition:'all 0.15s', background: widgetStyle===opt.value ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--surface)', border:`1.5px solid ${widgetStyle===opt.value ? 'var(--accent)' : 'var(--border)'}`, boxShadow: widgetStyle===opt.value ? '0 0 12px rgba(var(--accent-rgb), 0.15)' : 'none', fontFamily:"'Noto Sans',sans-serif" }}>
              <div style={{ fontSize:13, fontWeight:600, color: widgetStyle===opt.value ? 'var(--accent)' : 'var(--text)', marginBottom:3, transition:'color 0.15s' }}>{opt.label}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Language Mode */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Language mode</label>
        <div style={{ display:'flex', gap:8 }}>
          {([
            { value: 'auto',     label: 'Auto',     desc: 'Whisper detects language' },
            { value: 'en',       label: 'English',   desc: 'English only' },
            { value: 'hi',       label: 'Hindi',     desc: 'Hindi / Devanagari' },
            { value: 'hinglish', label: 'Hinglish',  desc: 'Hindi + English' },
          ] as const).map(opt => (
            <button key={opt.value} onClick={() => {
              setLanguageMode(opt.value)
              invoke('set_language_mode', { mode: opt.value }).catch(console.error)
            }} style={{
              flex: 1, padding:'10px 8px', borderRadius:8, textAlign:'center',
              cursor:'pointer', transition:'all 0.15s',
              background: languageMode===opt.value ? 'rgba(242,106,75,0.08)' : 'var(--surface)',
              border:`1px solid ${languageMode===opt.value ? '#F26A4B' : 'var(--border)'}`,
              fontFamily:"'Noto Sans',sans-serif",
            }}>
              <div style={{ fontSize:12, fontWeight:600, color: languageMode===opt.value ? '#F26A4B' : 'var(--text)', marginBottom:2 }}>
                {opt.label}
              </div>
              <div style={{ fontSize:10, color:'var(--text-muted)', lineHeight:1.3 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        {languageMode === 'hinglish' && (
          <div style={{ fontSize:11, color:'var(--text-muted)', background:'rgba(242,106,75,0.04)', border:'1px solid rgba(242,106,75,0.15)', borderRadius:6, padding:'8px 10px' }}>
            Hinglish mode uses Whisper with Hindi language hint (<code style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>-l hi</code>) for optimal Hindi+English code-switching. Use Whisper Small or Turbo model.
          </div>
        )}
      </section>

      {/* Downloaded models */}
      {downloaded.length > 0 && (
        <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Downloaded models</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {downloaded.map(m => (
              <ModelCard key={m.id} model={m}
                selected={
                  selectedModelId
                    ? selectedModelId === m.id
                    : selectedModel === m.filename && !m.id.startsWith('hinglish')
                }
                downloaded loading={loadingModel===m.filename}
                dlProgress={dlProgress[m.filename]??null} downloading={activeDownload===m.filename}
                onDownload={() => handleDownload(m)} onSelect={() => handleSelect(m.filename, m.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Available */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Available to download</label>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {available.map(m => (
            <ModelCard key={m.id} model={m} selected={false} downloaded={false} loading={false}
              dlProgress={dlProgress[m.filename]??null} downloading={activeDownload===m.filename}
              onDownload={() => handleDownload(m)} onSelect={() => handleSelect(m.filename, m.id)} />
          ))}
        </div>
      </section>

      {/* Microphone */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Microphone</label>
        <select value={selectedMic} onChange={e => {
          setSelectedMic(e.target.value)
          invoke('set_setting', { key:'microphone', value: e.target.value })
            .then(refreshMicStatus)
            .catch(console.error)
        }} style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', color:'var(--text)', fontSize:13, fontFamily:"'Noto Sans',sans-serif", outline:'none', cursor:'pointer' }}>
          <option value="">System Default</option>
          {mics.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px' }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12, color: micStatus?.ready ? '#4ADE80' : '#EF4444', marginBottom:3 }}>
              {micStatus?.ready ? 'Microphone ready' : 'Microphone needs attention'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {micStatus?.ready
                ? (micStatus.selected_device ?? micStatus.default_device ?? 'System default')
                : (micStatus?.error ?? 'Run a microphone check.')}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={refreshMicStatus} style={{ fontSize:11, color:'var(--text-muted)', background:'none', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', cursor:'pointer' }}>Check</button>
            <button onClick={() => invoke('open_mic_settings').catch(console.error)} style={{ fontSize:11, color:'var(--text)', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', cursor:'pointer' }}>Windows Settings</button>
          </div>
        </div>
      </section>

      {/* Sensitivity */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Mic sensitivity — {Math.round(sensitivity*100)}%</label>
        <input type="range" min="0" max="1" step="0.05" value={sensitivity} onChange={e=>setSensitivity(+e.target.value)} style={{ width:'100%', accentColor:'#F26A4B', cursor:'pointer' }} />
      </section>

      {/* Groq API Key */}
      <section style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <label style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Groq API key</label>
        <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="gsk_..."
          style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', color:'var(--text)', fontSize:13, fontFamily:"'JetBrains Mono',monospace", outline:'none' }}
          onFocus={e=>(e.target.style.borderColor='var(--accent)')}
          onBlur={e=>(e.target.style.borderColor='var(--border)')} />
        <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>Used automatically for translation and summarization.</p>
      </section>

      <button onClick={save} style={{ width:'100%', padding:'13px 0', borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer', transition:'all 0.15s', border:'none', fontFamily:"'Noto Sans',sans-serif", background: saved ? 'rgba(74,222,128,0.12)' : 'var(--primary)', color: saved ? '#4ADE80' : 'var(--primary-fg)' }}>
        {saved ? 'Saved' : 'Save settings'}
      </button>
    </div>
  )
}
