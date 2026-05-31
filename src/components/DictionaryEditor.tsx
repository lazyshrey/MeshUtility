// CRUD interface for custom word replacements.

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Entry { id: number; spoken: string; replaced: string }

export function DictionaryEditor() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [spoken, setSpoken] = useState('')
  const [replaced, setReplaced] = useState('')

  const load = () => invoke<Entry[]>('get_dictionary').then(setEntries)
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!spoken.trim() || !replaced.trim()) return
    await invoke('add_dictionary_entry', { spoken: spoken.trim(), replaced: replaced.trim() })
    setSpoken('')
    setReplaced('')
    load()
  }

  const remove = async (id: number) => {
    await invoke('delete_dictionary_entry', { id })
    load()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}
         className="text-[var(--text)]">
      <div>
        <h2 className="font-['Instrument_Serif'] text-2xl">Custom dictionary</h2>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Define text replacements for terms Whisper frequently gets wrong.
          Matching is case-insensitive and whole-word only, so <code className="text-[var(--text)]">cloud</code> rewrites <code className="text-[var(--text)]">Cloud</code> but not <code className="text-[var(--text)]">cloudy</code>.
          Separate multiple spoken forms with a slash, e.g. <code className="text-[var(--text)]">shree/shri/shiree</code>.
        </p>
      </div>

      {/* Add new entry */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-[var(--text-muted)]">What you say</label>
          <input
            value={spoken}
            onChange={e => setSpoken(e.target.value)}
            placeholder="e.g. next js"
            onKeyDown={e => e.key === 'Enter' && add()}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3
                       text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs text-[var(--text-muted)]">What appears</label>
          <input
            value={replaced}
            onChange={e => setReplaced(e.target.value)}
            placeholder="e.g. Next.js"
            onKeyDown={e => e.key === 'Enter' && add()}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3
                       text-[var(--text)] text-sm focus:outline-none focus:border-[var(--primary)]"
          />
        </div>
        <button
          onClick={add}
          className="px-5 py-3 bg-[var(--primary)] text-[var(--primary-fg)] rounded-xl
                     font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Add
        </button>
      </div>

      {/* Entries table */}
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id}
               className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)]
                          rounded-xl border border-[var(--border)] group">
            <code className="text-[var(--text-muted)] text-sm flex-1 font-['JetBrains_Mono']">
              "{entry.spoken}"
            </code>
            <span className="text-[var(--text-muted)] text-xs">→</span>
            <code className="text-[var(--text)] text-sm flex-1 font-['JetBrains_Mono']">
              "{entry.replaced}"
            </code>
            <button
              onClick={() => remove(entry.id)}
              className="opacity-0 group-hover:opacity-100 text-[var(--accent-2)]
                         text-xs transition-opacity hover:opacity-75"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
