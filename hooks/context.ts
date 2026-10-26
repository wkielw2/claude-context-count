import type { ContextFill } from '../types'

export type FillLevel = 'ok' | 'warn' | 'danger'

// `percent` is undefined while nothing is measured yet (before the first response, right after compacting).
export type FillView = { amount: string; bar: string; percent?: number; level: FillLevel; note?: string }

const BAR_CELLS = 10
const WARN_PERCENT = 70
const DANGER_PERCENT = 85

// 1234 → "1.2k", 1_000_000 → "1M"; whole numbers below a thousand.
export function compactTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens))
  const thousands = trimZero(tokens / 1000)
  // 999_500 rounds to "1000"; it reads as 1M instead.
  if (Number(thousands) < 1000) return `${thousands}k`

  return `${trimZero(tokens / 1_000_000)}M`
}

const trimZero = (value: number): string => value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '')

export function bar(percent: number): string {
  const filled = Math.min(BAR_CELLS, Math.max(0, Math.round((percent / 100) * BAR_CELLS)))

  return '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

const levelOf = (percent: number): FillLevel => {
  if (percent >= DANGER_PERCENT) return 'danger'
  if (percent >= WARN_PERCENT) return 'warn'

  return 'ok'
}

const NOTES: Record<FillLevel, string | undefined> = { ok: undefined, warn: 'alto', danger: '⚠ compacta pronto' }

export const UNMEASURED = '–'

// Undefined only when the window is unknown; an unmeasured fill still shows an empty bar.
export function describeFill({ tokens, window, percent }: ContextFill): FillView | undefined {
  if (window <= 0) return undefined
  if (tokens === undefined) return { amount: `${UNMEASURED}/${compactTokens(window)}`, bar: bar(0), level: 'ok' }
  const used = percent ?? Math.round((tokens / window) * 100)
  const level = levelOf(used)

  return { amount: `${compactTokens(tokens)}/${compactTokens(window)}`, bar: bar(used), percent: used, level, note: NOTES[level] }
}
