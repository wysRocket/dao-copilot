import {vi} from 'vitest'

// Global test setup
global.console = {
  ...console,
  // Suppress console.log/warn/error in tests unless explicitly needed
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

// Provide Jest-compatible globals for legacy tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).jest = vi
