/**
 * ResultPopup — appears after a successful transcription.
 * Shows text, word count, duration, copy + dismiss.
 * Auto-dismisses after autoHideMs with a draining progress bar.
 * Hover pauses the timer.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

interface ResultPopupProps {
  text: string
  wordCount: number
  durationMs: number
  source: 'local' | 'cloud'
  onDismiss: () => void
  autoHideMs?: number
}

export function ResultPopup({
  text, wordCount, durationMs, source, onDismiss, autoHideMs = 4000
}: ResultPopupProps) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [progress, setProgress] = useState(100)
  const pausedRef = useRef(false)
  const startRef = useRef(0)
  const pausedAtRef = useRef(0)
  const elapsedRef = useRef(0)

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20)
    return () => clearTimeout(t)
  }, [])

  // Drain progress bar
  useEffect(() => {
    startRef.current = Date.now()
    const tick = setInterval(() => {
      if (pausedRef.current) return
      const elapsed = elapsedRef.current + (Date.now() - startRef.current)
      const pct = Math.max(0, 100 - (elapsed / autoHideMs) * 100)
      setProgress(pct)
      if (pct <= 0) {
        clearInterval(tick)
        setVisible(false)
        setTimeout(onDismiss, 280)
      }
    }, 50)
    return () => clearInterval(tick)
  }, [autoHideMs, onDismiss])

  const pause = useCallback(() => {
    pausedRef.current = true
    pausedAtRef.current = Date.now()
  }, [])

  const resume = useCallback(() => {
    elapsedRef.current += Date.now() - pausedAtRef.current
    startRef.current = Date.now()
    pausedRef.current = false
  }, [])

  const dismiss = () => {
    setVisible(false)
    setTimeout(onDismiss, 280)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const dur = durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      style={{
        position: 'fixed',
        bottom: '72px',
        right: '20px',
        width: '300px',
        background: '#1C1C1C',
        border: '0.5px solid #2C2C2C',
        borderRadius: '12px',
        overflow: 'hidden',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.96)',
        opacity: visible ? 1 : 0,
        transition: 'transform 240ms cubic-bezier(0.34,1.2,0.64,1), opacity 200ms ease',
        zIndex: 9999,
        fontFamily: "'DM Sans', sans-serif",
        pointerEvents: 'auto',
      }}
    >
      {/* Progress bar */}
      <div style={{ height: 2, background: '#1a1a1a', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${progress}%`,
          background: '#F26A4B',
          transition: 'width 50ms linear',
        }} />
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <p style={{
            color: '#E8E3DA', fontSize: 13, lineHeight: 1.55,
            margin: 0, flex: 1,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {text}
          </p>
          <button
            onClick={dismiss}
            style={{
              background: 'none', border: 'none', color: '#555',
              cursor: 'pointer', fontSize: 18, lineHeight: 1,
              flexShrink: 0, padding: 0, marginTop: -2,
            }}
          >×</button>
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingTop: 10, borderTop: '0.5px solid #252525',
        }}>
          <span style={{ color: '#5C5A56', fontSize: 11 }}>{wordCount}w</span>
          <span style={{ color: '#333', fontSize: 11 }}>·</span>
          <span style={{ color: '#5C5A56', fontSize: 11 }}>{dur}</span>
          <span style={{ color: '#333', fontSize: 11 }}>·</span>
          <span style={{ color: source === 'cloud' ? '#F26A4B' : '#5C5A56', fontSize: 11 }}>
            {source === 'cloud' ? 'Cloud' : 'Local'}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleCopy}
            style={{
              background: 'none',
              border: '0.5px solid #2C2C2C',
              borderRadius: 6,
              color: copied ? '#4ADE80' : '#8E8A83',
              fontSize: 11, cursor: 'pointer',
              padding: '3px 8px',
              transition: 'all 150ms',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
