import React, { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { Github, Send, FileText, Shield, Heart } from 'lucide-react'

export function AboutView() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {})
  }, [])

  const openLink = async (url: string) => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
    } catch {
      window.open(url, '_blank')
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header section with brand representation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
        <img 
          src="/logo-prompt.png" 
          alt="MeshUtility Logo" 
          style={{ width: 56, height: 56, borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)' }} 
        />
        <div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, fontWeight: 400, color: 'var(--text)', margin: 0 }}>
            MeshUtility Suite
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ 
              fontSize: 11, 
              fontFamily: 'var(--font-mono)', 
              background: 'var(--surface-2)', 
              color: 'var(--text)', 
              padding: '2px 8px', 
              borderRadius: 12, 
              border: '1px solid var(--border)' 
            }}>
              v{version || '1.0.9'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Open Source (Apache-2.0)
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid content */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {/* Product / Website Card */}
        <div style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--border)', 
          borderRadius: 12, 
          padding: 24, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between',
          minHeight: 200,
          transition: 'all 0.15s ease'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Send size={18} style={{ color: 'var(--primary)' }} />
              <strong style={{ color: 'var(--text)', fontSize: 14 }}>Product by MeshPilot</strong>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              MeshUtility is part of the MeshPilot suite of AI developer tools. We are building terminal-first workspaces, shared project memories, and context-aware agents to simplify developer workflows.
            </p>
          </div>
          <button 
            type="button"
            onClick={() => void openLink('https://meshpilot.in')}
            style={{ 
              marginTop: 20,
              fontSize: 12, 
              color: 'var(--text)', 
              background: 'var(--surface-2)', 
              border: '1px solid var(--border)', 
              borderRadius: 8, 
              padding: '8px 16px', 
              cursor: 'pointer',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
          >
            Explore MeshPilot Website
          </button>
        </div>

        {/* GitHub Card */}
        <div style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--border)', 
          borderRadius: 12, 
          padding: 24, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between',
          minHeight: 200,
          transition: 'all 0.15s ease'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Github size={18} style={{ color: 'var(--primary)' }} />
              <strong style={{ color: 'var(--text)', fontSize: 14 }}>Open Source on GitHub</strong>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              MeshUtility is open source under the Apache-2.0 License. You can check the repository to clone, fork, submit pull requests, or file issues and feature requests.
            </p>
          </div>
          <button 
            type="button"
            onClick={() => void openLink('https://github.com/MeshPilot-in/MeshUtility')}
            style={{ 
              marginTop: 20,
              fontSize: 12, 
              color: 'var(--text)', 
              background: 'var(--surface-2)', 
              border: '1px solid var(--border)', 
              borderRadius: 8, 
              padding: '8px 16px', 
              cursor: 'pointer',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
          >
            Visit GitHub Repository
          </button>
        </div>

        {/* Terms & Conditions Card */}
        <div style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--border)', 
          borderRadius: 12, 
          padding: 24, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'space-between',
          minHeight: 200,
          transition: 'all 0.15s ease'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Shield size={18} style={{ color: 'var(--primary)' }} />
              <strong style={{ color: 'var(--text)', fontSize: 14 }}>Terms & Policies</strong>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              By using MeshUtility and the services of MeshPilot, you agree to our standard terms and policies. Learn more about how we process data and operate:
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            <button 
              type="button"
              onClick={() => void openLink('https://meshpilot.in/terms')}
              style={{ 
                fontSize: 12, 
                color: 'var(--text)', 
                background: 'var(--surface-2)', 
                border: '1px solid var(--border)', 
                borderRadius: 8, 
                padding: '8px 12px', 
                cursor: 'pointer',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--muted)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
            >
              <FileText size={14} />
              Terms of Service
            </button>
            <button 
              type="button"
              onClick={() => void openLink('https://meshpilot.in/privacy')}
              style={{ 
                fontSize: 12, 
                color: 'var(--text)', 
                background: 'var(--surface-2)', 
                border: '1px solid var(--border)', 
                borderRadius: 8, 
                padding: '8px 12px', 
                cursor: 'pointer',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--muted)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
            >
              <Shield size={14} />
              Privacy Policy
            </button>
          </div>
        </div>
      </div>

      {/* Footer message / dedication */}
      <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>made with</span>
        <Heart size={10} style={{ color: 'var(--destructive)', fill: 'var(--destructive)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>by meshpilot team</span>
      </div>
    </div>
  )
}
