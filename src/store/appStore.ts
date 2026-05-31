import { create } from 'zustand'

export type RecordingState = 'idle' | 'listening' | 'processing' | 'done' | 'error'
export type Engine = 'local' | 'cloud'
export type RecordingMode = 'push-to-talk' | 'toggle'

export interface TranscriptionRecord {
  id: number
  text: string
  word_count: number
  duration_ms: number
  source: string
  created_at: string
}

export interface DictionaryEntry {
  id: number
  spoken: string
  replaced: string
}

export interface Stats {
  total_words: number
  total_minutes: number
  session_count: number
  avg_wpm: number
}

interface AppStore {
  // State
  recordingState: RecordingState
  engine: Engine
  recordingMode: RecordingMode
  hotkey: string
  audioLevels: number[]
  history: TranscriptionRecord[]
  dictionary: DictionaryEntry[]
  stats: Stats | null
  lastTranscription: string
  partialTranscription: string

  // Actions
  setRecordingState: (s: RecordingState) => void
  setEngine: (e: Engine) => void
  setAudioLevels: (levels: number[]) => void
  setHistory: (h: TranscriptionRecord[]) => void
  setDictionary: (d: DictionaryEntry[]) => void
  setStats: (s: Stats) => void
  setLastTranscription: (t: string) => void
  setPartialTranscription: (t: string) => void
  clearPartialTranscription: () => void
  prependHistory: (record: TranscriptionRecord) => void
}

export const useAppStore = create<AppStore>((set) => ({
  recordingState: 'idle',
  engine: 'local',
  recordingMode: 'push-to-talk',
  hotkey: 'Alt+Space',
  audioLevels: [0, 0, 0, 0, 0, 0, 0],
  history: [],
  dictionary: [],
  stats: null,
  lastTranscription: '',
  partialTranscription: '',

  setRecordingState: (recordingState) => set({ recordingState }),
  setEngine: (engine) => set({ engine }),
  setAudioLevels: (audioLevels) => set({ audioLevels }),
  setHistory: (history) => set({ history }),
  setDictionary: (dictionary) => set({ dictionary }),
  setStats: (stats) => set({ stats }),
  setLastTranscription: (lastTranscription) => set({ lastTranscription }),
  setPartialTranscription: (partialTranscription) => set({ partialTranscription }),
  clearPartialTranscription: () => set({ partialTranscription: '' }),
  prependHistory: (record) => set((state) => ({
    history: [record, ...state.history].slice(0, 100)
  })),
}))
