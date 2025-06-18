import {vi} from 'vitest'

// Global test setup
global.console = {
  ...console,
  // Suppress console.log/warn/error in tests unless explicitly needed
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}
