import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { type Stats, useAppStore } from '../store/appStore'

interface HistoryRecord {
  id: number
  text: string
  word_count: number
  duration_ms: number
  source: string
  audio_path: string | null
  created_at: string
}

// ─── MiniPlayer ───────────────────────────────────────────────────────────────
function MiniPlayer({ recordId, audioPath }: { recordId: number; audioPath: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setPlaying(false)
      setProgress(0)
      setDuration(0)
      setSrc(null)
    })

    if (!audioPath) {
      return () => { active = false }
    }

    invoke<number[]>('get_history_audio', { id: recordId })
      .then((bytes) => {
        const wav = new Uint8Array(bytes)
        objectUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
        if (active) setSrc(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => { if (active) setSrc(null) })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [audioPath, recordId])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onError={() => { setPlaying(false); setProgress(0); setDuration(0) }}
          onEnded={() => { setPlaying(false); setProgress(0) }}
          style={{ display: 'none' }}
        />
      )}

      {/* Play/pause button */}
      <button
        onClick={toggle}
        disabled={!src}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          background: src ? 'var(--surface-2)' : 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: src ? 'pointer' : 'default',
          flexShrink: 0, transition: 'all 0.15s',
        }}
      >
        {playing ? (
          <svg width="8" height="10" viewBox="0 0 8 10" fill="var(--text-muted)">
            <rect x="0" y="0" width="3" height="10" rx="1"/>
            <rect x="5" y="0" width="3" height="10" rx="1"/>
          </svg>
        ) : (
          <svg width="8" height="10" viewBox="0 0 8 10" fill="var(--text-muted)">
            <path d="M0 0L8 5L0 10Z"/>
          </svg>
        )}
      </button>

      {/* Progress track */}
      <div style={{ flex: 1, height: 3, background: 'var(--surface)', borderRadius: 2, position: 'relative', cursor: src ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (!src || !audioRef.current) return
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          audioRef.current.currentTime = pct * audioRef.current.duration
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.1s linear' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${progress}%`, transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', transition: 'left 0.1s linear' }} />
      </div>

      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, minWidth: 34 }}>
        {src ? fmt(duration) : '0:00'}
      </span>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export function Dashboard() {
  const { stats, lastTranscription, engine, recordingState, setStats, setLastTranscription, setEngine } = useAppStore()
  const [history, setHistory] = useState<HistoryRecord[]>([])

  const loadHistory = useCallback(() =>
    invoke<HistoryRecord[]>('get_history', { limit: 10 }).then(setHistory), [])

  useEffect(() => {
    loadHistory()
    invoke<Stats>('get_stats').then(setStats)
    invoke<string | null>('get_setting', { key: 'engine' }).then((value) => {
      if (value === 'local' || value === 'cloud') setEngine(value)
    })

    const unsub = listen<string>('transcription-complete', (e) => {
      setLastTranscription(e.payload)
      loadHistory()
      invoke<Stats>('get_stats').then(setStats)
    })
    return () => { unsub.then(f => f()) }
  }, [loadHistory, setEngine, setLastTranscription, setStats])

  const deleteEntry = async (id: number) => {
    await invoke('delete_history_entry', { id })
    loadHistory()
    invoke<Stats>('get_stats').then(setStats)
  }

  const deleteAll = async () => {
    await invoke('delete_all_history')
    setHistory([])
    invoke<Stats>('get_stats').then(setStats)
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  const quickAddDictionary = async (text: string) => {
    const spoken = window.prompt('Spoken phrase to replace', text.split(/\s+/).slice(0, 3).join(' '))
    if (!spoken?.trim()) return
    const replaced = window.prompt('Replacement text', spoken)
    if (!replaced?.trim()) return
    await invoke('add_dictionary_entry', { spoken: spoken.trim(), replaced: replaced.trim() })
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: recordingState === 'listening' ? 'var(--accent)' : recordingState === 'processing' ? '#D1CFC0' : 'var(--text-muted)',
            ...(recordingState === 'listening' ? { animation: 'pulse-dot 0.8s ease infinite' } : {}),
          }} />
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, fontWeight: 400 }}>MeshVoice</h1>
        </div>

        {/* Engine toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', borderRadius: 8, padding: 4 }}>
          {(['local', 'cloud'] as const).map((e) => (
            <button key={e} onClick={() => { setEngine(e); invoke('set_setting', { key: 'engine', value: e }) }}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.12s',
                background: engine === e ? 'var(--surface-2)' : 'transparent',
                border: engine === e ? '1px solid var(--border)' : '1px solid transparent',
                color: engine === e ? 'var(--text)' : 'var(--text-muted)',
                fontFamily: "'Noto Sans', sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {e === 'local'
                ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.5 19H9a7 7 0 116.71-9h1.79a4.5 4.5 0 110 9Z"/></svg>}
              {e === 'local' ? 'Local' : 'Cloud'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {[
          { label: 'Total words', value: stats?.total_words?.toLocaleString() ?? '—' },
          { label: 'Minutes spoken', value: stats ? `${stats.total_minutes}m` : '—' },
          { label: 'Sessions', value: stats?.session_count ?? '—' },
          { label: 'Avg WPM', value: stats?.avg_wpm ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--surface)', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', fontFamily: "'Noto Sans', sans-serif" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Last transcription */}
      {lastTranscription && (
        <div style={{ margin: '12px 24px 0', padding: 14, background: 'var(--surface)', border: '1px solid rgba(var(--accent-rgb), 0.25)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0, flex: 1 }}>{lastTranscription}</p>
          <button onClick={() => copyToClipboard(lastTranscription)} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>Copy</button>
        </div>
      )}

      {/* History */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            History <span style={{ color: 'var(--border)', fontWeight: 400 }}>({history.length}/10)</span>
          </span>
          {history.length > 0 && (
            <button onClick={deleteAll} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'Noto Sans',sans-serif", transition: 'all 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.4)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
              Delete all
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.4}>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
            <p style={{ fontSize: 13 }}>Hold Alt+Space to start dictating</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((record) => (
              <div key={record.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(record.created_at)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => copyToClipboard(record.text)} style={{ padding: '2px 6px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }} title="Copy text">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button onClick={() => quickAddDictionary(record.text)} style={{ padding: '2px 6px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }} title="Add dictionary replacement">
                      Dict
                    </button>
                    <button onClick={() => deleteEntry(record.id)} style={{ padding: '2px 6px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s' }}
                      title="Delete" onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#EF4444' }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                </div>

                {/* Transcribed text */}
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0, marginBottom: 4 }}>{record.text}</p>

                {/* Meta */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{record.word_count}w</span>
                  <span style={{ fontSize: 11, color: 'var(--border)' }}>·</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDuration(record.duration_ms)}</span>
                  <span style={{ fontSize: 11, color: 'var(--border)' }}>·</span>
                  <span style={{ fontSize: 11, color: record.source === 'cloud' ? 'var(--accent)' : 'var(--text-muted)' }}>{record.source}</span>
                </div>

                {/* Audio player */}
                <MiniPlayer recordId={record.id} audioPath={record.audio_path} />
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1}50%{opacity:0.3} }
      `}</style>
    </div>
  )
}
