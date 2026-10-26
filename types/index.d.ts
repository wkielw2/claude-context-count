export type ContextFill = { tokens?: number; window: number; percent?: number }

declare module 'claude-code' {
  interface PluginState {
    'contexto-tokens': { fill: ContextFill | null }
  }
}
