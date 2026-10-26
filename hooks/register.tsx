import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { describeFill } from './context'
import type { FillLevel } from './context'

// Usage only changes after a response; the tick covers compactions and model switches.
const REFRESH_MS = 10000

const fill = atom({ plugin: 'contexto-tokens', key: 'fill' } as const, null)

const BAR_COLORS: Record<FillLevel, 'success' | 'warning' | 'error'> = { ok: 'success', warn: 'warning', danger: 'error' }

async function refresh($: EngineInterface): Promise<void> {
  try {
    const { context } = await $.session.usage()
    const { tokens, window, percent } = context
    const previous = await read($, fill)
    const isUnchanged = previous?.tokens === tokens && previous?.window === window && previous?.percent === percent
    // An update always writes and redraws its readers, so skip it when nothing moved.
    if (isUnchanged) return
    await update($, fill, () => ({ tokens, window, percent }))
  } catch {
    // Retried on the next tick or turn.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void refresh($)
    $.clock.every(REFRESH_MS, () => refresh($))

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void refresh($)

    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    void refresh($)

    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    void refresh($)

    return result
  })

  // The right of the prompt footer, as one more column beside the 5h and weekly ones
  // drawn there (label, bar, percentage, detail), kept whole after it.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beside = await next(e)
    const current = await read($, fill)
    const view = current && describeFill(current)
    if (!view) return beside

    const { Box, Text } = $.ui.resolve(e)
    const color = BAR_COLORS[view.level]
    // Core's own drawing is opaque and empty without modes; another mod's tree is not.
    const hasBeside = beside.type !== 'engine' || e.props.modes.length > 0

    return (
      <Box flexDirection="row">
        <Box flexDirection="column">
          <Text>contexto </Text>
          <Box flexDirection="column">
            <Text color={color}>{view.bar}</Text>
            <Text color={color}> {view.percent}%{view.note ? ` ${view.note}` : ''}</Text>
            <Text> {view.amount}</Text>
          </Box>
        </Box>
        {hasBeside ? <Text dimColor> · </Text> : null}
        {beside}
      </Box>
    )
  })
}
