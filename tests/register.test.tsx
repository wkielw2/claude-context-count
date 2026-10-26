import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

type Usage = { tokens?: number; window: number; percent?: number }

const PLUGIN = 'contexto-tokens'
const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const MODE = { plugin: PLUGIN, component: 'SessionMode', props: { modes: [] } } as const
const SURFACES = ['terminal', 'desktop'] as const

// The engine beneath the plugin: usage is whatever `usage.current` holds now.
// `sets` counts how many times the plugin wrote its state.
function engine(on: On, initial: Usage, { isCore = false } = {}) {
  const usage = { current: initial, reads: 0, sets: 0, isFailing: false }
  on('session.usage', () => {
    usage.reads += 1
    if (usage.isFailing) throw new Error('usage unavailable')

    return { value: { startedAt: 0, context: usage.current, rateLimits: [] } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('session.compact', () => ({ skip: 'test' }))
  on('state.set', (_, e, next) => {
    usage.sets += 1

    return next(e)
  })
  // The drawing beneath the plugin: core's opaque one, or another mod's tree the plugin must keep.
  on('ui.render', ($, e) => {
    if (isCore) return { type: 'engine', ref: 0 } as const
    const { Text } = $.ui.resolve(e)

    return <Text>engine: mode</Text>
  })

  return usage
}

for (const surface of SURFACES) {
  test(`${surface}: without a measure only the engine's drawing is shown`, async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    engine(on, { window: 200_000 })
    await $.session.start(START)
    await clock.settle()

    const ui = await $.ui.mount({ ...MODE, surface })

    expect(await ui.find({ text: /contexto/ })).toBe(undefined)
    expect((await ui.drawn()).type).toBe('Text')
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine: mode')
    await ui.unmount()
  })

  test(`${surface}: with a measure it draws the column and keeps the engine's tree after it`, async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    engine(on, { tokens: 84_000, window: 200_000, percent: 42 })
    await $.session.start(START)
    await clock.settle()

    const ui = await $.ui.mount({ ...MODE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)

    expect(texts).toEqual(['contexto ', '████░░░░░░', ' 42%', ' 84k/200k', ' · ', 'engine: mode'])
    await ui.unmount()
  })
}

test('the bar and percentage take the colour of their level; the label and amount stay plain', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 84_000, window: 200_000, percent: 42 })
  await $.session.start(START)
  await clock.settle()

  const colorsFor = async (current: Usage) => {
    usage.current = current
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })
    const colored = (await ui.findAll({ type: 'Text', text: /█|%/ })).map(t => [t.text, t.props.color])
    const label = await ui.find({ type: 'Text', text: 'contexto ' })
    const amount = await ui.find({ type: 'Text', text: '/200k' })
    await ui.unmount()

    expect(label).toBeDefined()
    expect(amount).toBeDefined()

    return { colored, label: label?.props.color, amount: amount?.props.color }
  }

  const ok = await colorsFor({ tokens: 84_000, window: 200_000, percent: 42 })
  expect(ok.colored).toEqual([['████░░░░░░', 'success'], [' 42%', 'success']])
  expect(ok.label).toBe(undefined)
  expect(ok.amount).toBe(undefined)

  const warn = await colorsFor({ tokens: 150_000, window: 200_000, percent: 75 })
  expect(warn.colored).toEqual([['████████░░', 'warning'], [' 75% alto', 'warning']])

  const danger = await colorsFor({ tokens: 180_000, window: 200_000, percent: 90 })
  expect(danger.colored).toEqual([['█████████░', 'error'], [' 90% ⚠ compacta pronto', 'error']])
})

test('the level changes exactly at 70% and 85%', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 1, window: 100, percent: 69 })
  await $.session.start(START)
  await clock.settle()

  const colorAt = async (percent: number) => {
    usage.current = { tokens: percent, window: 100, percent }
    await clock.advance(10_000)
    const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })
    const color = (await ui.find({ type: 'Text', text: /█/ }))?.props.color
    await ui.unmount()

    return color
  }

  expect([await colorAt(69), await colorAt(70), await colorAt(84), await colorAt(85)]).toEqual(['success', 'warning', 'warning', 'error'])
})

test('a measure without a percentage is computed from tokens and window', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on, { tokens: 50_000, window: 200_000 })
  await $.session.start(START)
  await clock.settle()

  const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toBe(' 25%')
  await ui.unmount()
})

test('the column follows the usage on each 10 s tick', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { window: 200_000 })
  await $.session.start(START)
  await clock.settle()
  usage.current = { tokens: 100_000, window: 200_000, percent: 50 }

  await clock.advance(9_000)
  const before = await $.ui.mount({ ...MODE, surface: 'terminal' })
  expect(await before.find({ text: /contexto/ })).toBe(undefined)
  await before.unmount()

  await clock.advance(1_000)
  const after = await $.ui.mount({ ...MODE, surface: 'terminal' })
  expect((await after.find({ type: 'Text', text: /%/ }))?.text).toBe(' 50%')
  await after.unmount()
})

test('a failing usage read keeps the last measure and the next tick recovers', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 20_000, window: 200_000, percent: 10 })
  await $.session.start(START)
  await clock.settle()

  usage.isFailing = true
  usage.current = { tokens: 100_000, window: 200_000, percent: 50 }
  const reads = usage.reads
  await clock.advance(10_000)
  expect(usage.reads).toBeGreaterThan(reads)
  const stale = await $.ui.mount({ ...MODE, surface: 'terminal' })
  expect((await stale.find({ type: 'Text', text: /%/ }))?.text).toBe(' 10%')
  await stale.unmount()

  usage.isFailing = false
  await clock.advance(10_000)
  const fresh = await $.ui.mount({ ...MODE, surface: 'terminal' })
  expect((await fresh.find({ type: 'Text', text: /%/ }))?.text).toBe(' 50%')
  await fresh.unmount()
})

test('state is not rewritten while the measure is unchanged, and is when it changes', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 84_000, window: 200_000, percent: 42 })
  await $.session.start(START)
  await clock.settle()
  const afterFirst = usage.sets
  expect(afterFirst).toBeGreaterThan(0)

  await clock.advance(30_000)
  expect(usage.sets).toBe(afterFirst)

  usage.current = { tokens: 90_000, window: 200_000, percent: 45 }
  await clock.advance(10_000)
  expect(usage.sets).toBeGreaterThan(afterFirst)
})

test('a change in window alone, or in percent alone, is written', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 84_000, window: 200_000, percent: 42 })
  await $.session.start(START)
  await clock.settle()

  for (const next of [
    { tokens: 84_000, window: 1_000_000, percent: 42 },
    { tokens: 84_000, window: 1_000_000, percent: 8 },
    { tokens: 84_000, window: 1_000_000 },
  ]) {
    const before = usage.sets
    usage.current = next
    await clock.advance(10_000)
    expect(usage.sets).toBeGreaterThan(before)
  }
})

test('a tool call refreshes the measure without waiting for the tick', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 10_000, window: 200_000, percent: 5 })
  await $.session.start(START)
  await clock.settle()

  usage.current = { tokens: 20_000, window: 200_000, percent: 10 }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.settle()
  const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /%/ }))?.text).toBe(' 10%')
  await ui.unmount()
})

test('other components are left to the engine untouched', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on, { tokens: 84_000, window: 200_000, percent: 42 })
  await $.session.start(START)
  await clock.settle()

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'PromptHint', props: { hint: '', isDraft: false, isWorking: false } as never })

  expect(await ui.find({ text: /contexto/ })).toBe(undefined)
  await ui.unmount()
})

test('with core drawing alone and no modes there is no dangling separator', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on, { tokens: 84_000, window: 200_000, percent: 42 }, { isCore: true })
  await $.session.start(START)
  await clock.settle()

  const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)

  expect(texts).toEqual(['contexto ', '████░░░░░░', ' 42%', ' 84k/200k'])
  await ui.unmount()
})

test('with core drawing and modes the separator stays', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on, { tokens: 84_000, window: 200_000, percent: 42 }, { isCore: true })
  await $.session.start(START)
  await clock.settle()

  const ui = await $.ui.mount({ ...MODE, props: { modes: ['focus'] }, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: ' · ' })).toBeDefined()
  await ui.unmount()
})

test('the end of a turn and a compaction refresh the measure without waiting for the tick', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const usage = engine(on, { tokens: 10_000, window: 200_000, percent: 5 })
  await $.session.start(START)
  await clock.settle()

  const percentShown = async () => {
    await clock.settle()
    const ui = await $.ui.mount({ ...MODE, surface: 'terminal' })
    const text = (await ui.find({ type: 'Text', text: /%/ }))?.text
    await ui.unmount()

    return text
  }

  usage.current = { tokens: 20_000, window: 200_000, percent: 10 }
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await percentShown()).toBe(' 10%')

  usage.current = { tokens: 30_000, window: 200_000, percent: 15 }
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hola', toolUses: [] }] } as never)
  expect(await percentShown()).toBe(' 15%')
})
