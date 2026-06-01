/**
 * MeshVoice floating pill widget.
 * States: idle → listening → processing → done → idle
 *                                       → error → idle
 *
 * All state transitions use CSS-driven spring animation on the container dims.
 * Content cross-dissolves via opacity on a short delay.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { type RecordingState, type Stats, type TranscriptionRecord, useAppStore } from '../store/appStore'
import { Waveform } from './Waveform'
import { ResultPopup } from './ResultPopup'

type PillState = 'idle' | 'listening' | 'processing' | 'done' | 'error'

const PILL_SIZES: Record<PillState, { w: number; h: number }> = {
  idle:       { w: 172, h: 36 },
  listening:  { w: 264, h: 52 },
  processing: { w: 200, h: 40 },
  done:       { w: 160, h: 36 },
  error:      { w: 220, h: 36 },
}

const BORDER_COLOR: Record<PillState, string> = {
  idle:       'rgba(44,44,44,0.9)',
  listening:  '#F26A4B',
  processing: '#D1CFC0',
  done:       '#4ADE80',
  error:      '#EF4444',
}

const TEXT_COLOR: Record<PillState, string> = {
  idle:       '#8E8A83',
  listening:  '#F26A4B',
  processing: '#D1CFC0',
  done:       '#4ADE80',
  error:      '#EF4444',
}

interface PopupData {
  text: string
  wordCount: number
  durationMs: number
  source: 'local' | 'cloud'
}

export function Widget() {
  const { audioLevels, setAudioLevels, setRecordingState, setLastTranscription, setHistory, setStats } = useAppStore()
  const [pillState, setPillState] = useState<PillState>('idle')
  const [contentVisible, setContentVisible] = useState(true)
  const [recSeconds, setRecSeconds] = useState(0)
  const [popup, setPopup] = useState<PopupData | null>(null)
  const [partialText, setPartialText] = useState<string | null>(null)

  const pillStateRef = useRef<PillState>('idle')
  const recStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── State transition with cross-dissolve ────────────────────────────────
  const transition = useCallback((next: PillState) => {
    setContentVisible(false)
    if (next !== 'listening') {
      setPartialText(null)
    }
    setTimeout(() => {
      pillStateRef.current = next
      setPillState(next)
      const recordingState: RecordingState = next === 'error' ? 'idle' : next
      setRecordingState(recordingState)
      setTimeout(() => setContentVisible(true), 60)
    }, 80)
  }, [setRecordingState])

  // ─── Event listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const subs = [
      // Hotkey pressed → start mic immediately, UI second
      listen('hotkey-pressed', async () => {
        if (pillStateRef.current !== 'idle') return
        invoke('start_recording').catch(console.error)
        recStartRef.current = Date.now()
        setRecSeconds(0)
        transition('listening')
        timerRef.current = setInterval(() => {
          setRecSeconds((Date.now() - recStartRef.current) / 1000)
        }, 80)
      }),

      // Hotkey released → stop + transcribe
      listen('hotkey-released', async () => {
        if (pillStateRef.current !== 'listening') return
        clearInterval(timerRef.current!)
        const durationMs = Date.now() - recStartRef.current
        transition('processing')
        try {
          const text = await invoke<string>('stop_recording_and_transcribe', { durationMs, accessToken: null })
          if (!text || !text.trim()) {
            transition('error')
            doneTimeoutRef.current = setTimeout(() => transition('idle'), 1500)
            return
          }
          transition('done')
          setLastTranscription(text)
          setTimeout(() => {
            setPopup({
              text,
              wordCount: text.trim().split(/\s+/).length,
              durationMs,
              source: 'local',
            })
          }, 100)
          doneTimeoutRef.current = setTimeout(() => {
            transition('idle')
            invoke<TranscriptionRecord[]>('get_history', { limit: 50 }).then(setHistory)
            invoke<Stats>('get_stats').then(setStats)
          }, 600)
        } catch {
          transition('error')
          doneTimeoutRef.current = setTimeout(() => transition('idle'), 1500)
        }
      }),

      // Audio levels from Rust backend
      listen<number[]>('audio-levels', (e) => {
        setAudioLevels(e.payload)
      }),

      // Partial transcription (Hinglish streaming preview)
      listen<string>('transcription-partial', (e) => {
        if (pillStateRef.current === 'listening') {
          setPartialText(e.payload)
        }
      }),

      // Transcription complete (also triggered by Rust directly)
      listen<string>('transcription-complete', (e) => {
        if (pillStateRef.current === 'processing') {
          const text = e.payload
          if (text && text.trim()) {
            transition('done')
            setLastTranscription(text)
            setTimeout(() => {
              setPopup({
                text,
                wordCount: text.trim().split(/\s+/).length,
                durationMs: Date.now() - recStartRef.current,
                source: 'local',
              })
            }, 100)
            doneTimeoutRef.current = setTimeout(() => {
              transition('idle')
              invoke<TranscriptionRecord[]>('get_history', { limit: 50 }).then(setHistory)
              invoke<Stats>('get_stats').then(setStats)
            }, 600)
          } else {
            transition('error')
            doneTimeoutRef.current = setTimeout(() => transition('idle'), 1500)
          }
        }
      }),
    ]

    return () => {
      subs.forEach(p => p.then(f => f()))
      clearInterval(timerRef.current!)
      clearTimeout(doneTimeoutRef.current!)
    }
  }, [transition, setAudioLevels, setLastTranscription, setHistory, setStats])

  const size = PILL_SIZES[pillState]
  const borderColor = BORDER_COLOR[pillState]
  const textColor = TEXT_COLOR[pillState]

  const listeningH = partialText ? 72 : PILL_SIZES.listening.h
  const listeningW = partialText ? 320 : PILL_SIZES.listening.w
  const effectiveSize = pillState === 'listening' ? { w: listeningW, h: listeningH } : size

  return (
    <>
      {/* Result popup */}
      {popup && (
        <ResultPopup
          text={popup.text}
          wordCount={popup.wordCount}
          durationMs={popup.durationMs}
          source={popup.source}
          onDismiss={() => setPopup(null)}
          autoHideMs={4000}
        />
      )}

      {/* Pill */}
      <div
        data-tauri-drag-region
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: effectiveSize.w,
          height: effectiveSize.h,
          borderRadius: 99,
          border: `${pillState === 'listening' ? 1 : 0.5}px solid ${borderColor}`,
          background: 'rgba(16,16,16,0.94)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: 'all 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          cursor: 'default',
          userSelect: 'none',
          zIndex: 9998,
          boxShadow: pillState === 'listening'
            ? '0 0 0 1px rgba(242,106,75,0.15), 0 4px 24px rgba(242,106,75,0.12)'
            : '0 2px 16px rgba(0,0,0,0.6)',
        }}
      >
        {/* Ripple ring during listening */}
        {pillState === 'listening' && (
          <div style={{
            position: 'absolute',
            inset: -8,
            borderRadius: 99,
            border: '1px solid rgba(242,106,75,0.25)',
            animation: 'ripple 1.4s ease-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        {/* Content — cross-dissolves */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 18px',
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 80ms ease',
          width: '100%',
          justifyContent: 'center',
        }}>
          {pillState === 'idle' && <IdleContent />}
          {pillState === 'listening' && (
            <ListeningContent levels={audioLevels} seconds={recSeconds} color={textColor} partial={partialText} />
          )}
          {pillState === 'processing' && <ProcessingContent color={textColor} />}
          {pillState === 'done' && <DoneContent color={textColor} />}
          {pillState === 'error' && <ErrorContent color={textColor} />}
        </div>
      </div>

      {/* Widget-level CSS animations */}
      <style>{`
        @keyframes ripple {
          0%   { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.6); opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

// ─── Inner state components ───────────────────────────────────────────────

function IdleContent() {
  return (
    <>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: '#3A3A3A', flexShrink: 0,
      }} />
      <span style={{
        color: '#8E8A83', fontSize: 12, fontWeight: 500,
        letterSpacing: '0.02em', fontFamily: "'Noto Sans', sans-serif",
      }}>
        MeshVoice
      </span>
      <span style={{
        color: '#3A3A3A', fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        Alt+Space
      </span>
    </>
  )
}

function ListeningContent({ levels, seconds, color, partial }: { levels: number[]; seconds: number; color: string; partial: string | null }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, width:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, width:'100%', justifyContent:'center' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, flexShrink: 0,
          animation: 'pulse-dot 0.8s ease-in-out infinite',
        }} />
        <Waveform levels={levels} color={color} height={28} />
        <span style={{
          color, fontSize: 11, fontWeight: 500,
          fontFamily: "'Noto Sans', sans-serif", flexShrink: 0,
        }}>
          Listening
        </span>
        <span style={{
          color: 'rgba(242,106,75,0.5)', fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, minWidth: 28,
        }}>
          {seconds.toFixed(1)}s
        </span>
      </div>
      {partial && (
        <div style={{
          fontSize: 10,
          color: 'rgba(242,106,75,0.7)',
          fontFamily: "'Noto Sans', sans-serif",
          maxWidth: 280,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
          opacity: 0.9,
          transition: 'opacity 0.2s ease',
          textAlign: 'center',
        }}>
          {partial.length > 55 ? '…' + partial.slice(-55) : partial}
        </div>
      )}
    </div>
  )
}

function ProcessingContent({ color }: { color: string }) {
  return (
    <>
      <svg
        width="14" height="14" viewBox="0 0 14 14" fill="none"
        style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
      >
        <circle cx="7" cy="7" r="5.5" stroke="#2C2C2C" strokeWidth="1.5" />
        <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span style={{
        color, fontSize: 11, fontWeight: 500,
        fontFamily: "'Noto Sans', sans-serif",
      }}>
        Transcribing
      </span>
    </>
  )
}

function DoneContent({ color }: { color: string }) {
  return (
    <>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M2.5 7L5.5 10L11.5 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ color, fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans', sans-serif" }}>
        Injected
      </span>
    </>
  )
}

function ErrorContent({ color }: { color: string }) {
  return (
    <>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.2" />
        <path d="M7 4.5V7.5M7 9.5V9.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span style={{ color, fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans', sans-serif" }}>
        No speech detected
      </span>
    </>
  )
}
