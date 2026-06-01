/**
 * WidgetApp — always-on-top floating pill/circle window.
 * Features: first-run mic permission gate, Fix It button on mic errors, draggable, no shadow.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { ResultPopup } from './components/ResultPopup'
import { useAppStore } from './store/appStore'

type PillState = 'idle' | 'listening' | 'processing' | 'done' | 'error' | 'mic-prompt'

const PILL: Record<PillState, { w: number; h: number }> = {
  idle:       { w: 140, h: 36 },
  listening:  { w: 140, h: 36 },
  processing: { w: 140, h: 36 },
  done:       { w: 140, h: 36 },
  error:      { w: 140, h: 36 },
  'mic-prompt': { w: 140, h: 36 },
}

const CIRCLE_PILL: Record<PillState, { w: number; h: number }> = {
  idle:       { w: 36, h: 36 },
  listening:  { w: 36, h: 36 },
  processing: { w: 36, h: 36 },
  done:       { w: 36, h: 36 },
  error:      { w: 220, h: 36 }, // Dynamic expansion to pill so error remains readable
  'mic-prompt': { w: 140, h: 36 }, // Dynamic expansion to pill so setup details remain readable
}

const BORDER: Record<PillState, string> = {
  idle:         'rgba(50,50,50,0.95)',
  listening:    '#F26A4B',
  processing:   '#D1CFC0',
  done:         '#4ADE80',
  error:        '#EF4444',
  'mic-prompt': '#F26A4B', // Synced Terracotta Orange Setup Border
}

const COLOR: Record<PillState, string> = {
  idle:         '#8E8A83',
  listening:    '#F26A4B',
  processing:   '#D1CFC0',
  done:         '#4ADE80',
  error:        '#EF4444',
  'mic-prompt': '#F26A4B', // Synced Terracotta Orange Setup Text
}

interface PopupData {
  text: string; wordCount: number; durationMs: number; source: 'local' | 'cloud'
}

interface MicrophoneStatus {
  available: boolean
  ready: boolean
  selected_device: string | null
  default_device: string | null
  error: string | null
}

interface TranscriptionComplete {
  text: string
  word_count: number
  duration_ms: number
  source: 'local' | 'cloud'
}

function isMicError(msg: string) {
  return msg.toLowerCase().includes('mic') ||
         msg.toLowerCase().includes('microphone') ||
         msg.toLowerCase().includes('stream') ||
         msg.toLowerCase().includes('audio') ||
         msg.toLowerCase().includes('permission') ||
         msg.toLowerCase().includes('blocked') ||
         msg.toLowerCase().includes('privacy')
}

export default function WidgetApp() {
  const [pillState, setPillState] = useState<PillState>('idle')
  const [contentVisible, setContentVisible] = useState(true)
  const [popup, setPopup] = useState<PopupData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [errorIsMic, setErrorIsMic] = useState(false)
  const [micDetail, setMicDetail] = useState('Checking microphone')
  const [widgetStyle, setWidgetStyle] = useState<'pill' | 'circle' | 'invisible'>('pill')
  
  const partialTranscription = useAppStore((state) => state.partialTranscription)
  const setPartialTranscription = useAppStore((state) => state.setPartialTranscription)
  const clearPartialTranscription = useAppStore((state) => state.clearPartialTranscription)

  const stateRef = useRef<PillState>('idle')
  const recStartRef = useRef(0)
  const sessionIdRef = useRef<number | null>(null)
  const releaseGuardUntilRef = useRef(0)
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appWinRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null)
  
  useEffect(() => {
    try { appWinRef.current = getCurrentWindow() } catch { /* ignore */ }
  }, [])

  const resizeTo = useCallback(async (s: PillState, styleOverride?: 'pill' | 'circle' | 'invisible') => {
    if (!appWinRef.current) return
    const activeStyle = styleOverride || widgetStyle
    const { w, h } = activeStyle === 'circle' ? CIRCLE_PILL[s] : PILL[s]
    try { await appWinRef.current.setSize(new LogicalSize(w, h)) } catch { return }
  }, [widgetStyle])

  const transition = useCallback((next: PillState) => {
    if (stateRef.current === next) {
      void resizeTo(next)
      return
    }
    setContentVisible(false)
    setTimeout(async () => {
      stateRef.current = next
      setPillState(next)
      await resizeTo(next)
      setTimeout(() => setContentVisible(true), 60)
    }, 80)
  }, [resizeTo])

  const showError = useCallback((msg: string) => {
    const isMic = isMicError(msg)
    setErrorIsMic(isMic)
    setErrorMsg(isMic ? 'Mic access blocked' : msg)
    transition('error')
    if (doneRef.current) clearTimeout(doneRef.current)
    doneRef.current = setTimeout(() => transition('idle'), isMic ? 6000 : 4000)
  }, [transition])

  const refreshMicStatus = useCallback(async () => {
    try {
      const status = await invoke<MicrophoneStatus>('check_microphone_status')
      if (status.ready) {
        setMicDetail(status.selected_device ?? status.default_device ?? 'Microphone ready')
        transition('idle')
        return true
      }
      setMicDetail(status.error ?? 'Microphone is not ready')
      transition('mic-prompt')
      return false
    } catch (e) {
      setMicDetail(String(e))
      transition('mic-prompt')
      return false
    }
  }, [transition])

  const startCapture = useCallback(async () => {
    if (stateRef.current === 'mic-prompt') {
      void refreshMicStatus()
      return
    }
    if (stateRef.current !== 'idle') return
    try {
      clearPartialTranscription()
      const sessionId = await invoke<number>('start_recording')
      sessionIdRef.current = sessionId
      releaseGuardUntilRef.current = Date.now() + 140
    } catch (e) {
      showError(String(e))
      return
    }
    recStartRef.current = Date.now()
    transition('listening')
  }, [clearPartialTranscription, refreshMicStatus, showError, transition])

  const stopCapture = useCallback(async () => {
    if (stateRef.current !== 'listening') return
    if (Date.now() < releaseGuardUntilRef.current) return
    const sessionId = sessionIdRef.current
    if (sessionId == null) return
    const durationMs = Date.now() - recStartRef.current
    transition('processing')
    try {
      const accessToken: string | null = null
      const text = await invoke<string>('stop_recording_and_transcribe', { durationMs, accessToken, sessionId })
      sessionIdRef.current = null
      if (!text?.trim()) {
        clearPartialTranscription()
        showError('No speech detected')
        return
      }
      clearPartialTranscription()
      transition('done')
      if (doneRef.current) clearTimeout(doneRef.current)
      doneRef.current = setTimeout(() => transition('idle'), 600)
    } catch(e) {
      const message = String(e)
      if (message.includes('Stale recording stop ignored')) {
        transition('listening')
        return
      }
      if (message.includes('Recording already stopped')) {
        sessionIdRef.current = null
        clearPartialTranscription()
        transition('idle')
        return
      }
      sessionIdRef.current = null
      clearPartialTranscription()
      showError(message)
    }
  }, [clearPartialTranscription, showError, transition])

  useEffect(() => {
    queueMicrotask(() => { void refreshMicStatus() })
  }, [refreshMicStatus, transition])

  // Load and listen for widget style configuration changes
  useEffect(() => {
    invoke<string|null>('get_setting', { key: 'widget_style' })
      .then(v => {
        if (v === 'circle' || v === 'invisible' || v === 'pill') {
          setWidgetStyle(v)
          const nextSize = v === 'circle' ? CIRCLE_PILL[stateRef.current] : PILL[stateRef.current]
          if (appWinRef.current) {
            appWinRef.current.setSize(new LogicalSize(nextSize.w, nextSize.h)).catch(() => {})
          }
        }
      })
      .catch(() => {})

    const sub = listen<string>('widget-style-changed', e => {
      const v = e.payload
      if (v === 'circle' || v === 'invisible' || v === 'pill') {
        setWidgetStyle(v)
        const nextSize = v === 'circle' ? CIRCLE_PILL[stateRef.current] : PILL[stateRef.current]
        if (appWinRef.current) {
          appWinRef.current.setSize(new LogicalSize(nextSize.w, nextSize.h)).catch(() => {})
        }
      }
    })
    return () => { sub.then(f => f()) }
  }, [])

  useEffect(() => {
    const subs = [
      listen('hotkey-pressed', startCapture),
      listen('hotkey-released', stopCapture),
      listen<string>('transcription-partial', (e) => {
        setPartialTranscription(e.payload)
      }),
      listen<TranscriptionComplete>('transcription-complete-detail', (e) => {
        if (stateRef.current !== 'processing' && stateRef.current !== 'done') return
        const text = e.payload.text
        clearPartialTranscription()
        setPopup({ text, wordCount: e.payload.word_count, durationMs: e.payload.duration_ms, source: e.payload.source })
      }),
    ]
    return () => { subs.forEach(p => p.then(f => f())); if (doneRef.current) clearTimeout(doneRef.current) }
  }, [clearPartialTranscription, setPartialTranscription, startCapture, stopCapture])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !appWinRef.current) return
    e.preventDefault()
    appWinRef.current.startDragging().catch(() => {})
  }, [])

  const handleDoubleClick = useCallback(() => {
    if (stateRef.current === 'listening') void stopCapture()
    else if (stateRef.current === 'idle') void startCapture()
    else invoke('show_main_window').catch(console.error)
  }, [startCapture, stopCapture])

  const handleGrantMic = useCallback(() => {
    invoke('open_mic_settings').catch(() => {})
  }, [])

  const handleFixMic = useCallback(() => {
    if (doneRef.current) clearTimeout(doneRef.current)
    invoke('open_mic_settings').catch(() => {})
  }, [])

  const size = widgetStyle === 'circle' ? CIRCLE_PILL[pillState] : PILL[pillState]
  const isCircleState = widgetStyle === 'circle' && ['idle', 'listening', 'processing', 'done'].includes(pillState)

  const getBorderColor = () => {
    if (widgetStyle === 'invisible' && pillState === 'idle') {
      return 'rgba(255, 255, 255, 0.12)'
    }
    return BORDER[pillState]
  }

  const getBackgroundStyle = () => {
    if (widgetStyle === 'invisible') {
      return 'rgba(18, 18, 18, 0.65)' // Smoked glass for flawless background contrast
    }
    return 'rgba(13, 13, 13, 0.96)'
  }

  const getBackdropFilter = () => {
    if (widgetStyle === 'invisible') {
      return 'blur(16px)' // Dynamic high blur to dissolve any text/patterns behind it
    }
    return 'blur(20px)'
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', overflow: 'hidden' }}>
      {popup && (
        <ResultPopup text={popup.text} wordCount={popup.wordCount} durationMs={popup.durationMs}
          source={popup.source} onDismiss={() => setPopup(null)} autoHideMs={4000} />
      )}

      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{
          width: size.w, height: size.h, borderRadius: 99,
          border: `0.5px solid ${getBorderColor()}`,
          background: getBackgroundStyle(),
          backdropFilter: getBackdropFilter(), WebkitBackdropFilter: getBackdropFilter(),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', transition: 'border-color 150ms ease, background 150ms ease',
          cursor: 'grab', userSelect: 'none', position: 'relative',
          boxShadow: 'none',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCircleState ? 0 : 8,
          padding: isCircleState ? '0' : '0 14px',
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 80ms ease',
          justifyContent: 'center',
          width: '100%'
        }}>
          {isCircleState ? (
            <>
              {pillState === 'idle' && (
                <img src="/logo-prompt.png" alt="" width="18" height="18" style={{ borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
              )}
              {pillState === 'listening' && (
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR.listening, flexShrink: 0, animation: 'pulse-d 0.8s ease-in-out infinite' }} />
              )}
              {pillState === 'processing' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="5.5" stroke="#2C2C2C" strokeWidth="1.5" />
                  <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke={COLOR.processing} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              {pillState === 'done' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M2.5 7L5.5 10L11.5 4" stroke={COLOR.done} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </>
          ) : (
            <>
              {pillState === 'idle'       && <IdleContent widgetStyle={widgetStyle} />}
              {pillState === 'listening'  && <ListeningContent color={COLOR.listening} widgetStyle={widgetStyle} />}
              {pillState === 'processing' && <SpinnerContent color={COLOR.processing} label={partialTranscription || 'Transcribing'} widgetStyle={widgetStyle} />}
              {pillState === 'done'       && <CheckContent color={COLOR.done} label="Injected" widgetStyle={widgetStyle} />}
              {pillState === 'error'      && <ErrorContent color={COLOR.error} label={errorMsg} isMic={errorIsMic} onFix={handleFixMic} widgetStyle={widgetStyle} />}
              {pillState === 'mic-prompt' && <MicPromptContent detail={micDetail} onGrant={handleGrantMic} widgetStyle={widgetStyle} />}
            </>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { background: transparent !important; width: 100%; height: 100%; overflow: hidden; }
        @keyframes ripple  { 0% { transform:scale(1); opacity:1; } 100% { transform:scale(1.6); opacity:0; } }
        @keyframes pulse-d { 0%,100% { transform:scale(1); } 50% { transform:scale(1.7); opacity:0.4; } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        .mv-btn { border: none; outline: none; cursor: pointer; transition: opacity 0.15s ease; }
        .mv-btn:hover { opacity: 0.8; }
        .mv-btn:active { opacity: 0.6; }
      `}</style>
    </div>
  )
}

function IdleContent({ widgetStyle }: { widgetStyle?: string }) {
  const isInvisible = widgetStyle === 'invisible'
  return (
    <>
      <img src="/logo-prompt.png" alt="" width="18" height="18" style={{ borderRadius:5, objectFit:'cover', flexShrink:0 }} />
      <span style={{ 
        color: isInvisible ? '#E8E3DA' : '#8E8A83', 
        fontSize:12, 
        fontWeight:500, 
        letterSpacing:'0.02em', 
        fontFamily:"'Noto Sans',sans-serif",
        textShadow: isInvisible ? '0 1px 2px rgba(0,0,0,0.5)' : 'none'
      }}>MeshUtility</span>
    </>
  )
}

function ListeningContent({ color, widgetStyle }: { color:string; widgetStyle?: string }) {
  const isInvisible = widgetStyle === 'invisible'
  return (
    <>
      <div style={{ width:7, height:7, borderRadius:'50%', background:color, flexShrink:0, animation:'pulse-d 0.8s ease-in-out infinite' }} />
      <span style={{ 
        color, 
        fontSize:12, 
        fontWeight:500, 
        fontFamily:"'Noto Sans',sans-serif", 
        flexShrink:0,
        textShadow: isInvisible ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
      }}>Listening</span>
    </>
  )
}

// label type is any to prevent typescript error if partialTranscription is null
function SpinnerContent({ color, label, widgetStyle }: { color:string; label:any; widgetStyle?: string }) {
  const isInvisible = widgetStyle === 'invisible'
  return (
    <>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation:'spin 0.8s linear infinite', flexShrink:0 }}>
        <circle cx="7" cy="7" r="5.5" stroke="#2C2C2C" strokeWidth="1.5" />
        <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span style={{ 
        color, 
        fontSize:12, 
        fontWeight:500, 
        fontFamily:"'Noto Sans',sans-serif", 
        minWidth:0, 
        overflow:'hidden', 
        textOverflow:'ellipsis', 
        whiteSpace:'nowrap',
        textShadow: isInvisible ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
      }}>{label}</span>
    </>
  )
}

function CheckContent({ color, label, widgetStyle }: { color:string; label:string; widgetStyle?: string }) {
  const isInvisible = widgetStyle === 'invisible'
  return (
    <>
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink:0 }}>
        <path d="M2.5 7L5.5 10L11.5 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ 
        color, 
        fontSize:12, 
        fontWeight:500, 
        fontFamily:"'Noto Sans',sans-serif",
        textShadow: isInvisible ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
      }}>{label}</span>
    </>
  )
}

function ErrorContent({ color, label, isMic, onFix, widgetStyle }: { color:string; label:string; isMic:boolean; onFix:()=>void; widgetStyle?: string }) {
  const isInvisible = widgetStyle === 'invisible'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, width:'100%', justifyContent:'center' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span style={{ 
        color, 
        fontSize:11, 
        fontWeight:500, 
        fontFamily:"'Noto Sans',sans-serif", 
        flexShrink:1, 
        minWidth:0, 
        overflow:'hidden', 
        textOverflow:'ellipsis', 
        whiteSpace:'nowrap',
        textShadow: isInvisible ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
      }}>{label}</span>
      {isMic && (
        <button
          className="mv-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onFix(); }}
          style={{
            background:'#EF4444', color:'#fff', fontSize:9, fontWeight:600,
            fontFamily:"'Noto Sans',sans-serif", padding:'2px 6px', borderRadius:99,
            flexShrink:0, letterSpacing:'0.04em'
          }}
        >
          Fix
        </button>
      )}
    </div>
  )
}

function MicPromptContent({ detail, onGrant, widgetStyle }: { detail:string; onGrant:()=>void; widgetStyle?: string }) {
  const isInvisible = widgetStyle === 'invisible'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, width:'100%', justifyContent:'center', padding:'0 4px' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F26A4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      <span title={detail} style={{ 
        color:'#F26A4B', 
        fontSize:11, 
        fontWeight:500, 
        fontFamily:"'Noto Sans',sans-serif", 
        flexShrink:1, 
        minWidth:0, 
        overflow:'hidden', 
        textOverflow:'ellipsis', 
        whiteSpace:'nowrap',
        textShadow: isInvisible ? '0 1px 2px rgba(0,0,0,0.4)' : 'none'
      }}>Mic setup</span>
      <button
        className="mv-btn"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onGrant(); }}
        style={{
          background:'#F26A4B', color:'#fff', fontSize:9, fontWeight:700,
          fontFamily:"'Noto Sans',sans-serif", padding:'2px 6px', borderRadius:99, flexShrink:0
        }}
      >
        Open
      </button>
    </div>
  )
}
