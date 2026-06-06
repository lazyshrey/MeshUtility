import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Sparkles, X, Download, AlertCircle, RefreshCw } from 'lucide-react'

interface UpdateCheckResult {
  updateAvailable: boolean
  version: string
  changelog: string
  downloadUrl: string
}

type UpdateState = 'idle' | 'checking' | 'available' | 'installing' | 'error'

export function UpdateWidget() {
  const [status, setStatus] = useState<UpdateState>('checking')
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const checkForUpdates = async () => {
    try {
      setStatus('checking')
      setErrorMsg(null)
      const result = await invoke<UpdateCheckResult>('check_for_updates')
      if (result.updateAvailable) {
        setUpdateInfo(result)
        setStatus('available')
      } else {
        setStatus('idle')
      }
    } catch (err) {
      console.error('Update check failed:', err)
      setErrorMsg(typeof err === 'string' ? err : String(err))
      setStatus('error')
    }
  }

  useEffect(() => {
    checkForUpdates()
  }, [])

  const handleUpdate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!updateInfo) return
    try {
      setStatus('installing')
      setErrorMsg(null)
      await invoke('install_update', { downloadUrl: updateInfo.downloadUrl })
    } catch (err) {
      console.error('Update installation failed:', err)
      setErrorMsg(typeof err === 'string' ? err : String(err))
      setStatus('error')
    }
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed(true)
  }

  if (dismissed) return null
  if (status === 'checking' || status === 'idle') return null

  return (
    <div 
      className={`utility-update-card ${status}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="utility-update-card-header">
        <div className="utility-update-title-wrapper">
          {status === 'error' ? (
            <AlertCircle size={14} className="utility-update-icon error" />
          ) : (
            <Sparkles size={14} className="utility-update-icon update" />
          )}
          <span className="utility-update-title-text">
            {status === 'error' && 'Update Error'}
            {status === 'available' && 'Update Available'}
            {status === 'installing' && 'Updating...'}
          </span>
        </div>
        <button 
          className="utility-update-dismiss-btn"
          onClick={handleDismiss}
          title="Dismiss"
          aria-label="Dismiss update notification"
        >
          <X size={12} />
        </button>
      </div>

      <div className="utility-update-card-body">
        {status === 'error' ? (
          <div className="utility-update-error-text">
            {errorMsg || 'An unexpected error occurred.'}
          </div>
        ) : (
          <div className="utility-update-info-text">
            Version <span className="utility-update-version-badge">{updateInfo?.version || 'new'}</span> is available.
          </div>
        )}
      </div>

      <div className="utility-update-card-actions">
        {status === 'error' ? (
          <button 
            className="utility-update-btn primary"
            onClick={(e) => {
              e.stopPropagation()
              if (updateInfo) {
                handleUpdate(e)
              } else {
                checkForUpdates()
              }
            }}
          >
            <RefreshCw size={12} className="utility-btn-icon" />
            <span>Retry</span>
          </button>
        ) : (
          <button 
            className={`utility-update-btn ${status === 'installing' ? 'loading' : 'primary'}`}
            disabled={status === 'installing'}
            onClick={handleUpdate}
          >
            {status === 'installing' ? (
              <>
                <RefreshCw size={12} className="utility-btn-icon spin" />
                <span>Downloading & installing...</span>
              </>
            ) : (
              <>
                <Download size={12} className="utility-btn-icon" />
                <span>Update Now</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
