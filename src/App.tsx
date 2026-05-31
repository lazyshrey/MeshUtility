import React, { useEffect, useState, useRef } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Dashboard } from './components/Dashboard'
import { Settings } from './components/Settings'
import { DictionaryEditor } from './components/DictionaryEditor'
import { MainApp as PromptApp } from './components/PromptApp'
import { useAppStore } from './store/appStore'

import './styles-prompt.css'

type View =
  | 'voice-history'
  | 'voice-dictionary'
  | 'voice-settings'
  | 'prompt-enhancer'
  | 'prompt-actions'
  | 'prompt-history'
  | 'prompt-providers'
  | 'prompt-settings';

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Voice Dictation',
    items: [
      {
        id: 'voice-history',
        label: 'Dictation History',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: 'voice-dictionary',
        label: 'Custom Dictionary',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Prompt Enhancer',
    items: [
      {
        id: 'prompt-enhancer',
        label: 'Enhance Prompt',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.828 3h3.982m-3.982 4h2.982M3 21l9-9m1.12-1.12a1.5 1.5 0 112.12-2.12l-2.12 2.12zm1.41-5.66a5 5 0 11-7.07 7.07l7.07-7.07z" />
          </svg>
        ),
      },
      {
        id: 'prompt-actions',
        label: 'Prompt Actions',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.286L13 21l-2.286-5.714L5 12l5.714-2.286L13 3z" />
          </svg>
        ),
      },
      {
        id: 'prompt-history',
        label: 'Action History',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        id: 'voice-settings',
        label: 'Voice Settings',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        ),
      },
      {
        id: 'prompt-providers',
        label: 'AI Providers',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 11a3 3 0 11-6 0 3 3 0 016 0zm0 0v.18a2 2 0 00.586 1.414l6.586 6.586a1 1 0 001.414 0l1.586-1.586a1 1 0 000-1.414l-1.086-1.086a1 1 0 01-.293-.707V15a1 1 0 00-1-1h-1.586a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 0010 11.18V11z" />
          </svg>
        ),
      },
      {
        id: 'prompt-settings',
        label: 'Enhancer Settings',
        icon: (
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
]

function handleBarMouseDown(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return
  let el: HTMLElement | null = e.target as HTMLElement
  while (el && el !== e.currentTarget) {
    if (el.tagName.toLowerCase() === 'button') return
    el = el.parentElement
  }
  e.preventDefault()
  getCurrentWindow().startDragging().catch(() => {})
}

function shouldSkipDrag(target: HTMLElement, boundary: HTMLElement) {
  let el: HTMLElement | null = target
  while (el && el !== boundary) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'a') return true
    el = el.parentElement
  }
  return false
}

function handleDragPointerDown(e: React.PointerEvent<HTMLDivElement>, appWindow: ReturnType<typeof getCurrentWindow> | null) {
  if (e.button !== 0 || !appWindow) return
  if (shouldSkipDrag(e.target as HTMLElement, e.currentTarget)) return
  e.preventDefault()
  appWindow.startDragging().catch(() => {})
}

function WinDot({ color, label, onClick }: { color: string; label: string; onClick: () => void }) {
  return (
    <button
      title={label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick() }}
      style={{
        width: 12, height: 12, borderRadius: '50%', background: color,
        border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0,
        outline: 'none', display: 'block', pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.4)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
    />
  )
}

export default function App() {
  const [view, setView] = useState<View>('voice-history')
  const [version, setVersion] = useState('0.2.3')
  const engine = useAppStore((state) => state.engine)
  const appWindowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null)

  useEffect(() => {
    try { appWindowRef.current = getCurrentWindow() } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {})

    // Listen to tray and deep-link navigation triggers
    const unsub = listen<string>('navigate-view', (event) => {
      const targetView = event.payload
      if (targetView === 'dashboard') {
        setView('voice-history')
      } else if (targetView === 'prompt') {
        setView('prompt-enhancer')
      } else if (targetView === 'settings') {
        setView('voice-settings')
      } else if (targetView === 'dictionary') {
        setView('voice-dictionary')
      } else if (['voice-history', 'voice-dictionary', 'voice-settings', 'prompt-enhancer', 'prompt-actions', 'prompt-history', 'prompt-providers', 'prompt-settings'].includes(targetView)) {
        setView(targetView as any)
      }
    })

    const unsubLegacy = listen('navigate-settings', () => setView('voice-settings'))

    const unsubPromptView = listen<string>('meshprompt://open-view', (event) => {
      const promptView = event.payload
      if (promptView === 'text') setView('prompt-enhancer')
      else if (promptView === 'providers') setView('prompt-providers')
      else if (promptView === 'actions') setView('prompt-actions')
      else if (promptView === 'history') setView('prompt-history')
      else if (promptView === 'settings') setView('prompt-settings')
    })

    return () => {
      unsub.then((f) => f())
      unsubLegacy.then((f) => f())
      unsubPromptView.then((f) => f())
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
        border: '1px solid var(--border)',
        borderRadius: '8px',
      }}
    >
      {/* ── Title bar ── */}
      <div
        data-tauri-drag-region
        onMouseDown={handleBarMouseDown}
        onPointerDown={(e) => handleDragPointerDown(e, appWindowRef.current)}
        style={{
          height: 40, display: 'flex', alignItems: 'center',
          padding: '0 16px', background: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0, userSelect: 'none', position: 'relative',
          cursor: 'move', width: '100%', touchAction: 'none',
        }}
      >
        <div style={{ flex: 1 }} />

        {/* Center title */}
        <span style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
          letterSpacing: '0.12em', color: 'var(--text-muted)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <img
            src="/logo-prompt.png"
            alt=""
            width="18"
            height="18"
            style={{ borderRadius: 5, objectFit: 'cover', border: '1px solid var(--border)' }}
          />
          MeshUtility Suite
        </span>

        {/* Right — window dots */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <WinDot color="#6e6e6e" label="Minimize"
            onClick={() => appWindowRef.current?.minimize()} />
          <WinDot color="#9e9e9e" label="Maximize"
            onClick={async () => {
              const appWindow = appWindowRef.current
              if (!appWindow) return
              if (await appWindow.isMaximized()) await appWindow.unmaximize()
              else await appWindow.maximize()
            }} />
          <WinDot color="var(--accent-2)" label="Close"
            onClick={() => appWindowRef.current?.close()} />
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 215, background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 0', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto' }}>
            {GROUPS.map((group) => (
              <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  padding: '0 20px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}>
                  {group.title}
                </span>
                <nav style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {group.items.map(({ id, label, icon }) => {
                    const active = view === id
                    return (
                      <button
                        key={id}
                        onClick={() => setView(id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 12px', borderRadius: 6, textAlign: 'left',
                          fontSize: 12.5, cursor: 'pointer', transition: 'all 0.12s ease',
                          background: active ? 'var(--surface)' : 'transparent',
                          border: active ? '1px solid var(--border)' : '1px solid transparent',
                          color: active ? 'var(--text)' : 'var(--text-muted)',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                        onMouseEnter={(e) => {
                          if (!active) {
                            (e.currentTarget as HTMLElement).style.background = 'var(--surface)'
                            ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!active) {
                            (e.currentTarget as HTMLElement).style.background = 'transparent'
                            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                          }
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
                        {label}
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          {/* Bottom meta */}
          <div
            data-tauri-drag-region
            onMouseDown={handleBarMouseDown}
            onPointerDown={(e) => handleDragPointerDown(e, appWindowRef.current)}
            style={{ 
              marginTop: 'auto', 
              padding: '12px', 
              cursor: 'move', 
              userSelect: 'none', 
              touchAction: 'none', 
              borderTop: '1px solid var(--border)', 
              paddingTop: 16 
            }}
          >
            <div 
              style={{
                background: 'rgba(255, 255, 255, 0.015)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.035)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.015)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {/* App Info Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img
                    src="/logo-prompt.png"
                    alt=""
                    width="26"
                    height="26"
                    style={{ 
                      borderRadius: 6, 
                      objectFit: 'cover', 
                      border: '1px solid var(--border)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)' 
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                    MeshUtility
                  </span>
                </div>
                {/* Version Badge */}
                <span 
                  style={{ 
                    fontSize: 9, 
                    fontFamily: "'JetBrains Mono', monospace", 
                    color: 'var(--accent)', 
                    background: 'rgba(242, 106, 75, 0.08)', 
                    border: '1px solid rgba(242, 106, 75, 0.2)',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    fontWeight: 500,
                  }}
                >
                  v{version}
                </span>
              </div>
              
              {/* Status Pill */}
              <div 
                style={{ 
                  fontSize: 10, 
                  fontWeight: 500,
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: engine === 'cloud' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                  border: engine === 'cloud' ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
                  color: engine === 'cloud' ? '#818CF8' : '#10B981',
                }}
              >
                {/* Pulsing indicator dot */}
                <span style={{ position: 'relative', display: 'flex', height: 6, width: 6 }}>
                  <span 
                    style={{ 
                      position: 'absolute', 
                      display: 'inline-flex', 
                      height: 6, 
                      width: 6, 
                      borderRadius: '50%', 
                      background: engine === 'cloud' ? '#818CF8' : '#10B981', 
                      opacity: 0.75,
                      animation: 'ping-status 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
                    }}
                  />
                  <span 
                    style={{ 
                      position: 'relative', 
                      display: 'inline-flex', 
                      borderRadius: '50%', 
                      height: 6, 
                      width: 6, 
                      background: engine === 'cloud' ? '#818CF8' : '#10B981' 
                    }}
                  />
                </span>
                <span style={{ fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {engine === 'cloud' ? 'Cloud transcription active' : 'Local Whisper engine active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main content — CSS-toggled to prevent switching glitches */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div style={{ display: view === 'voice-history' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
            <Dashboard />
          </div>
          <div style={{ display: view === 'voice-dictionary' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <DictionaryEditor />
          </div>
          <div style={{ display: view === 'voice-settings' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <Settings />
          </div>

          <div style={{
            display: ['prompt-enhancer', 'prompt-actions', 'prompt-history', 'prompt-providers', 'prompt-settings'].includes(view) ? 'flex' : 'none',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden'
          }}>
            <PromptApp
              embed={true}
              hideSidebar={true}
              activeView={
                view === 'prompt-enhancer' ? 'text' :
                view === 'prompt-actions' ? 'actions' :
                view === 'prompt-history' ? 'history' :
                view === 'prompt-providers' ? 'providers' :
                view === 'prompt-settings' ? 'settings' :
                'text'
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
