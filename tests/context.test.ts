import { expect, test } from 'claude-code/testing'

import { bar, compactTokens, describeFill } from '../hooks/context'

test('compacts token counts', () => {
  expect(compactTokens(950)).toBe('950')
  expect(compactTokens(1234)).toBe('1.2k')
  expect(compactTokens(45_600)).toBe('46k')
  expect(compactTokens(200_000)).toBe('200k')
  expect(compactTokens(1_000_000)).toBe('1M')
  expect(compactTokens(999_500)).toBe('1M')
})

test('fills the bar by percentage and clamps it', () => {
  expect(bar(0)).toBe('░░░░░░░░░░')
  expect(bar(42)).toBe('████░░░░░░')
  expect(bar(130)).toBe('██████████')
})

test('shows an empty bar before the first response', () => {
  expect(describeFill({ window: 200_000 })).toEqual({ amount: '–/200k', bar: '░░░░░░░░░░', level: 'ok' })
})

test('shows nothing while the window is unknown', () => {
  expect(describeFill({ window: 0 })).toBe(undefined)
})

test('shows nothing while the window is negative', () => {
  expect(describeFill({ window: -1 })).toBe(undefined)
  expect(describeFill({ tokens: 1000, window: -200_000 })).toBe(undefined)
})

test('zero measured tokens is a measure, not an unmeasured fill', () => {
  expect(describeFill({ tokens: 0, window: 200_000 })).toEqual({
    amount: '0/200k',
    bar: '░░░░░░░░░░',
    percent: 0,
    level: 'ok',
    note: undefined,
  })
})

test('shows tokens, window and percentage', () => {
  expect(describeFill({ tokens: 84_000, window: 200_000, percent: 42 })).toEqual({
    amount: '84k/200k',
    bar: '████░░░░░░',
    percent: 42,
    level: 'ok',
    note: undefined,
  })
})

test('computes the percentage when the engine omits it', () => {
  expect(describeFill({ tokens: 50_000, window: 200_000 })?.percent).toBe(25)
})

test('warns as the window fills', () => {
  expect(describeFill({ tokens: 150_000, window: 200_000, percent: 75 })).toMatchObject({ level: 'warn', note: 'alto' })
  expect(describeFill({ tokens: 180_000, window: 200_000, percent: 90 })).toMatchObject({ level: 'danger', note: '⚠ compacta pronto' })
})
