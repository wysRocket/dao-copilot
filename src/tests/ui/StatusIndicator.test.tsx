/**
 * StatusIndicator Component Tests
 *
 * Test suite for the StatusIndicator component covering
 * state management, visual changes, and event handling.
 */

import React from 'react'
import {render, screen, waitFor, act} from '@testing-library/react'
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest'
import StatusIndicator from '../../ui/StatusIndicator'
import {statusNotifier, StatusEventType, StatusEvent} from '../../ui/StatusNotifier'

// Mock the StatusNotifier
vi.mock('../../ui/StatusNotifier', () => ({
  statusNotifier: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  },
  StatusEventType: {
    CIRCUIT_BREAKER_OPENED: 'circuit_breaker_opened',
    CIRCUIT_BREAKER_CLOSED: 'circuit_breaker_closed',
    CIRCUIT_BREAKER_HALF_OPEN: 'circuit_breaker_half_open',
    SYSTEM_DEGRADED: 'system_degraded',
    SYSTEM_RECOVERED: 'system_recovered',
    FALLBACK_ACTIVATED: 'fallback_activated',
    FALLBACK_RECOVERED: 'fallback_recovered',
    CONNECTION_QUALITY_CHANGED: 'connection_quality_changed'
  }
}))

// Mock tailwind cn utility
vi.mock('@/utils/tailwind', () => ({
  cn: vi.fn((...classes) => classes.filter(Boolean).join(' '))
}))

describe('StatusIndicator', () => {
  let mockEventListener: vi.MockedFunction<(event: StatusEvent) => void>

  beforeEach(() => {
    vi.clearAllMocks()
    mockEventListener = vi.fn()

    // Mock the addEventListener to capture the event listener
    ;(
      statusNotifier.addEventListener as vi.MockedFunction<
        (listener: (event: StatusEvent) => void) => void
      >
    ).mockImplementation((listener: (event: StatusEvent) => void) => {
      mockEventListener = listener
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<StatusIndicator />)
    })

    it('renders with healthy status by default', () => {
      render(<StatusIndicator />)
      const indicator = screen.getByRole('status')
      expect(indicator).toBeInTheDocument()
      expect(indicator).toHaveAttribute('aria-label', 'System status: healthy')
    })

    it('registers event listener on mount', () => {
      render(<StatusIndicator />)
      expect(statusNotifier.addEventListener).toHaveBeenCalledWith(expect.any(Function))
    })

    it('unregisters event listener on unmount', () => {
      const {unmount} = render(<StatusIndicator />)
      unmount()
      expect(statusNotifier.removeEventListener).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('Size Variations', () => {
    it('applies small size class', () => {
      render(<StatusIndicator size="sm" />)
      const indicator = screen.getByRole('status')
      expect(indicator).toHaveClass('w-2', 'h-2')
    })

    it('applies medium size class by default', () => {
      render(<StatusIndicator />)
      const indicator = screen.getByRole('status')
      expect(indicator).toHaveClass('w-3', 'h-3')
    })

    it('applies large size class', () => {
      render(<StatusIndicator size="lg" />)
      const indicator = screen.getByRole('status')
      expect(indicator).toHaveClass('w-4', 'h-4')
    })
  })

  describe('Position Variations', () => {
    it('applies inline positioning by default', () => {
      render(<StatusIndicator />)
      const container = screen.getByRole('status').parentElement
      expect(container).toHaveClass('inline-flex')
    })

    it('applies fixed top-right positioning', () => {
      render(<StatusIndicator position="fixed-top-right" />)
      const container = screen.getByRole('status').parentElement
      expect(container).toHaveClass('fixed', 'top-4', 'right-4')
    })

    it('applies fixed bottom-left positioning', () => {
      render(<StatusIndicator position="fixed-bottom-left" />)
      const container = screen.getByRole('status').parentElement
      expect(container).toHaveClass('fixed', 'bottom-4', 'left-4')
    })
  })

  describe('Status State Management', () => {
    it('changes to error state on circuit breaker opened', async () => {
      render(<StatusIndicator />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveAttribute('aria-label', 'System status: error')
        expect(indicator).toHaveClass('bg-red-500')
      })
    })

    it('changes to warning state on circuit breaker half-open', async () => {
      render(<StatusIndicator />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_HALF_OPEN,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveAttribute('aria-label', 'System status: warning')
        expect(indicator).toHaveClass('bg-yellow-500')
      })
    })

    it('changes to healthy state on circuit breaker closed', async () => {
      render(<StatusIndicator />)

      // First make it unhealthy
      const errorEvent = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(errorEvent)
      })

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'System status: error')
      })

      // Then recover
      const recoveryEvent = {
        type: StatusEventType.CIRCUIT_BREAKER_CLOSED,
        source: 'test-service',
        data: {},
        timestamp: Date.now() + 1000
      }

      act(() => {
        mockEventListener(recoveryEvent)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveAttribute('aria-label', 'System status: healthy')
        expect(indicator).toHaveClass('bg-green-500')
      })
    })

    it('changes to degraded state on fallback activated', async () => {
      render(<StatusIndicator />)

      const event = {
        type: StatusEventType.FALLBACK_ACTIVATED,
        source: 'websocket-transport',
        data: {fallbackService: 'http-stream'},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveAttribute('aria-label', 'System status: degraded')
        expect(indicator).toHaveClass('bg-blue-500')
      })
    })
  })

  describe('Label Display', () => {
    it('does not show label by default', () => {
      render(<StatusIndicator />)
      expect(screen.queryByText('All systems operational')).not.toBeInTheDocument()
    })

    it('shows label when showLabel is true', () => {
      render(<StatusIndicator showLabel />)
      expect(screen.getByText('All systems operational')).toBeInTheDocument()
    })

    it('updates label text based on status', async () => {
      render(<StatusIndicator showLabel />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        expect(screen.getByText('Service issues detected')).toBeInTheDocument()
      })
    })
  })

  describe('Animation Behavior', () => {
    it('applies pulse animation for warning status', async () => {
      render(<StatusIndicator animated />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_HALF_OPEN,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveClass('animate-pulse')
      })
    })

    it('applies pulse animation for error status', async () => {
      render(<StatusIndicator animated />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveClass('animate-pulse')
      })
    })

    it('does not apply pulse animation for healthy status', async () => {
      render(<StatusIndicator animated />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_CLOSED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).not.toHaveClass('animate-pulse')
      })
    })

    it('does not animate when animated prop is false', async () => {
      render(<StatusIndicator animated={false} />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).not.toHaveClass('animate-pulse')
      })
    })
  })

  describe('Event Count Display', () => {
    it('shows event count after multiple events', async () => {
      render(<StatusIndicator animated />)

      // Send multiple events quickly
      for (let i = 0; i < 6; i++) {
        const event = {
          type: StatusEventType.CIRCUIT_BREAKER_OPENED,
          source: `service-${i}`,
          data: {},
          timestamp: Date.now() + i * 100
        }

        act(() => {
          mockEventListener(event)
        })
      }

      await waitFor(() => {
        // Should show event count badge
        expect(screen.getByText('6')).toBeInTheDocument()
      })
    })

    it('does not show event count for healthy status', async () => {
      render(<StatusIndicator animated />)

      // Send multiple healthy events
      for (let i = 0; i < 6; i++) {
        const event = {
          type: StatusEventType.CIRCUIT_BREAKER_CLOSED,
          source: `service-${i}`,
          data: {},
          timestamp: Date.now() + i * 100
        }

        act(() => {
          mockEventListener(event)
        })
      }

      await waitFor(() => {
        // Should not show event count for healthy status
        expect(screen.queryByText('6')).not.toBeInTheDocument()
      })
    })

    it('shows exclamation mark for event count over 99', async () => {
      render(<StatusIndicator animated />)

      // Simulate a high event count
      act(() => {
        for (let i = 0; i < 100; i++) {
          const event = {
            type: StatusEventType.CIRCUIT_BREAKER_OPENED,
            source: `service-${i}`,
            data: {},
            timestamp: Date.now() + i
          }
          mockEventListener(event)
        }
      })

      await waitFor(() => {
        expect(screen.getByText('!')).toBeInTheDocument()
      })
    })
  })

  describe('Auto Recovery', () => {
    it('auto-recovers to healthy after 30 seconds of no events', async () => {
      vi.useFakeTimers()

      render(<StatusIndicator />)

      // Make status unhealthy
      const errorEvent = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(errorEvent)
      })

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'System status: error')
      })

      // Advance time by 35 seconds
      act(() => {
        vi.advanceTimersByTime(35000)
      })

      await waitFor(() => {
        const indicator = screen.getByRole('status')
        expect(indicator).toHaveAttribute('aria-label', 'System status: healthy')
      })

      vi.useRealTimers()
    })

    it('does not auto-recover if already healthy', async () => {
      vi.useFakeTimers()

      render(<StatusIndicator />)

      // Start with healthy status (default)
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'System status: healthy')

      // Advance time
      act(() => {
        vi.advanceTimersByTime(40000)
      })

      // Should still be healthy
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'System status: healthy')

      vi.useRealTimers()
    })

    it('does not auto-recover if recent events occurred', async () => {
      vi.useFakeTimers()

      render(<StatusIndicator />)

      // Make status unhealthy
      const errorEvent = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(errorEvent)
      })

      // Advance time by 20 seconds
      act(() => {
        vi.advanceTimersByTime(20000)
      })

      // Send another event
      const recentEvent = {
        type: StatusEventType.SYSTEM_DEGRADED,
        source: 'system',
        data: {},
        timestamp: Date.now() + 20000
      }

      act(() => {
        mockEventListener(recentEvent)
      })

      // Advance time by another 20 seconds (40 total, but only 20 since last event)
      act(() => {
        vi.advanceTimersByTime(20000)
      })

      // Should not auto-recover yet
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'System status: error')

      vi.useRealTimers()
    })
  })

  describe('Tooltip Behavior', () => {
    it('shows tooltip on hover by default', async () => {
      render(<StatusIndicator />)

      const container = screen.getByRole('status').parentElement

      if (container) {
        // Simulate hover
        act(() => {
          container.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
        })

        await waitFor(() => {
          expect(screen.getByText('All systems operational')).toBeInTheDocument()
        })
      }
    })

    it('hides tooltip when showTooltip is false', async () => {
      render(<StatusIndicator showTooltip={false} />)

      const container = screen.getByRole('status').parentElement

      if (container) {
        // Simulate hover
        act(() => {
          container.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
        })

        // Tooltip should not appear
        expect(screen.queryByText('All systems operational')).not.toBeInTheDocument()
      }
    })

    it('updates tooltip content based on status', async () => {
      render(<StatusIndicator />)

      // Change status
      const event = {
        type: StatusEventType.FALLBACK_ACTIVATED,
        source: 'websocket-transport',
        data: {fallbackService: 'http-stream'},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      const container = screen.getByRole('status').parentElement

      if (container) {
        // Simulate hover
        act(() => {
          container.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
        })

        await waitFor(() => {
          expect(screen.getByText('Using backup services')).toBeInTheDocument()
          expect(screen.getByText('websocket-transport: Fallback active')).toBeInTheDocument()
        })
      }
    })
  })
})
