// 7-bar audio frequency visualizer with real amplitude + idle breathing.

interface WaveformProps {
  levels: number[]   // 7 values, 0.0–1.0
  color: string
  height?: number
}

const BASE_HEIGHTS = [0.35, 0.55, 0.75, 1.0, 0.75, 0.55, 0.35]
const MIN_H = 3
const MAX_H = 26

export function Waveform({ levels, color, height = 28 }: WaveformProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: `${height}px` }}>
      {Array.from({ length: 7 }).map((_, i) => {
        const level = levels[i] ?? 0
        const base = BASE_HEIGHTS[i]
        const h = Math.max(MIN_H, base * (0.3 + level * 0.7) * MAX_H)
        return (
          <div
            key={i}
            style={{
              width: '3px',
              height: `${h}px`,
              borderRadius: '2px',
              background: color,
              opacity: 0.4 + level * 0.6,
              transition: 'height 80ms ease-out, opacity 80ms ease-out',
              flexShrink: 0,
            }}
          />
        )
      })}
    </div>
  )
}
