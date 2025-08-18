/**
 * ConnectionStatusBanner Component Tests
 *
 * Comprehensive test suite for the ConnectionStatusBanner component
 * covering event handling, state management, and UI rendering.
 */

import React from 'react'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest'
import ConnectionStatusBanner from '../../ui/ConnectionStatusBanner'
import {statusNotifier, StatusEventType, StatusEvent} from '../../ui/StatusNotifier'

// Mock the StatusNotifier
vi.mock('../../ui/StatusNotifier', () => ({
  statusNotifier: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    emitEvent: vi.fn()
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
  },
  NotificationType: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    SUCCESS: 'success'
  }
}))

// Mock tailwind cn utility
vi.mock('@/utils/tailwind', () => ({
  cn: vi.fn((...classes) => classes.filter(Boolean).join(' '))
}))

describe('ConnectionStatusBanner', () => {
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
      render(<ConnectionStatusBanner />)
    })

    it('is initially hidden', () => {
      render(<ConnectionStatusBanner />)
      const banner = screen.queryByRole('status')
      expect(banner).not.toBeInTheDocument()
    })

    it('registers event listener on mount', () => {
      render(<ConnectionStatusBanner />)
      expect(statusNotifier.addEventListener).toHaveBeenCalledWith(expect.any(Function))
    })

    it('unregisters event listener on unmount', () => {
      const {unmount} = render(<ConnectionStatusBanner />)
      unmount()
      expect(statusNotifier.removeEventListener).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('Error State Rendering', () => {
    it('displays error banner for circuit breaker opened', async () => {
      render(<ConnectionStatusBanner />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'websocket-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        expect(screen.getByText('Service Temporarily Unavailable')).toBeInTheDocument()
        expect(
          screen.getByText('Experiencing connection issues. Switching to backup mode.')
        ).toBeInTheDocument()
      })
    })

    it('shows retry and details buttons for circuit breaker opened', async () => {
      render(<ConnectionStatusBanner />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'websocket-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        expect(screen.getByRole('button', {name: /retry now/i})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: /view details/i})).toBeInTheDocument()
      })
    })

    it('applies correct error styling', async () => {
      render(<ConnectionStatusBanner />)

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
        const banner = screen.getByText('Service Temporarily Unavailable').closest('div')
        expect(banner).toHaveClass('bg-red-50')
      })
    })
  })

  describe('Warning State Rendering', () => {
    it('displays warning banner for system degraded', async () => {
      render(<ConnectionStatusBanner />)

      const event = {
        type: StatusEventType.SYSTEM_DEGRADED,
        source: 'system',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        expect(screen.getByText('System Performance Degraded')).toBeInTheDocument()
        expect(
          screen.getByText('Some services are experiencing issues. Functionality may be limited.')
        ).toBeInTheDocument()
      })
    })

    it('shows check status button for system degraded', async () => {
      render(<ConnectionStatusBanner />)

      const event = {
        type: StatusEventType.SYSTEM_DEGRADED,
        source: 'system',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        expect(screen.getByRole('button', {name: /check status/i})).toBeInTheDocument()
      })
    })
  })

  describe('Success State Rendering', () => {
    it('displays success banner for circuit breaker closed', async () => {
      render(<ConnectionStatusBanner />)

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
        expect(screen.getByText('Service Restored')).toBeInTheDocument()
        expect(
          screen.getByText('Primary connection is now operating normally.')
        ).toBeInTheDocument()
      })
    })

    it('applies correct success styling', async () => {
      render(<ConnectionStatusBanner />)

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
        const banner = screen.getByText('Service Restored').closest('div')
        expect(banner).toHaveClass('bg-green-50')
      })
    })
  })

  describe('Info State Rendering', () => {
    it('displays info banner for fallback activated', async () => {
      render(<ConnectionStatusBanner />)

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
        expect(screen.getByText('Backup Mode Active')).toBeInTheDocument()
        expect(
          screen.getByText('Switched to http-stream for continued service.')
        ).toBeInTheDocument()
      })
    })
  })

  describe('User Interactions', () => {
    it('handles close button click', async () => {
      const onClose = vi.fn()
      render(<ConnectionStatusBanner onClose={onClose} />)

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
        const closeButton = screen.getByRole('button', {name: /dismiss notification/i})
        fireEvent.click(closeButton)
      })

      expect(onClose).toHaveBeenCalled()

      await waitFor(() => {
        expect(screen.queryByText('Service Temporarily Unavailable')).not.toBeInTheDocument()
      })
    })

    it('handles retry button click', async () => {
      vi.useFakeTimers()

      render(<ConnectionStatusBanner />)

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
        const retryButton = screen.getByRole('button', {name: /retry now/i})
        fireEvent.click(retryButton)
      })

      expect(statusNotifier.emitEvent).toHaveBeenCalledWith(
        StatusEventType.CIRCUIT_BREAKER_HALF_OPEN,
        'test-service',
        {manual: true}
      )

      vi.useRealTimers()
    })

    it('shows loading state during retry', async () => {
      vi.useFakeTimers()

      render(<ConnectionStatusBanner />)

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
        const retryButton = screen.getByRole('button', {name: /retry now/i})
        fireEvent.click(retryButton)
      })

      const loadingButton = screen.getByRole('button', {name: /retry now/i})
      expect(loadingButton).toBeDisabled()

      // Advance timers to complete the loading state
      act(() => {
        vi.advanceTimersByTime(2000)
      })

      await waitFor(() => {
        expect(loadingButton).not.toBeDisabled()
      })

      vi.useRealTimers()
    })

    it('handles view details button click', async () => {
      const consoleSpy = vi.spyOn(console, 'group').mockImplementation()
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation()
      const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation()

      render(<ConnectionStatusBanner />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {errorCode: '1007'},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      await waitFor(() => {
        const detailsButton = screen.getByRole('button', {name: /view details/i})
        fireEvent.click(detailsButton)
      })

      expect(consoleSpy).toHaveBeenCalledWith('Connection Status Details')
      expect(consoleLogSpy).toHaveBeenCalledWith('Event Type:', event.type)
      expect(consoleLogSpy).toHaveBeenCalledWith('Source:', event.source)
      expect(consoleLogSpy).toHaveBeenCalledWith('Data:', event.data)
      expect(consoleGroupEndSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
      consoleLogSpy.mockRestore()
      consoleGroupEndSpy.mockRestore()
    })
  })

  describe('Auto-hide Behavior', () => {
    it('auto-hides success messages after delay', async () => {
      vi.useFakeTimers()

      render(<ConnectionStatusBanner autoHideDelayMs={3000} />)

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
        expect(screen.getByText('Service Restored')).toBeInTheDocument()
      })

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      await waitFor(() => {
        expect(screen.queryByText('Service Restored')).not.toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('does not auto-hide error messages', async () => {
      vi.useFakeTimers()

      render(<ConnectionStatusBanner autoHideDelayMs={3000} />)

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
        expect(screen.getByText('Service Temporarily Unavailable')).toBeInTheDocument()
      })

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      // Error message should still be visible
      expect(screen.getByText('Service Temporarily Unavailable')).toBeInTheDocument()

      vi.useRealTimers()
    })

    it('does not auto-hide when persistent prop is true', async () => {
      vi.useFakeTimers()

      render(<ConnectionStatusBanner persistent autoHideDelayMs={1000} />)

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
        expect(screen.getByText('Service Restored')).toBeInTheDocument()
      })

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // Message should still be visible due to persistent prop
      expect(screen.getByText('Service Restored')).toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe('Manual Dismiss Prevention', () => {
    it('prevents showing new messages for 30 seconds after manual dismissal', async () => {
      vi.useFakeTimers()

      render(<ConnectionStatusBanner />)

      // First event
      const firstEvent = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(firstEvent)
      })

      await waitFor(() => {
        expect(screen.getByText('Service Temporarily Unavailable')).toBeInTheDocument()
      })

      // Manually dismiss
      const closeButton = screen.getByRole('button', {name: /dismiss notification/i})
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByText('Service Temporarily Unavailable')).not.toBeInTheDocument()
      })

      // Second event within 30 seconds should be ignored
      const secondEvent = {
        type: StatusEventType.SYSTEM_DEGRADED,
        source: 'system',
        data: {},
        timestamp: Date.now() + 10000 // 10 seconds later
      }

      act(() => {
        mockEventListener(secondEvent)
      })

      // Should not show the new message
      expect(screen.queryByText('System Performance Degraded')).not.toBeInTheDocument()

      // Advance time beyond 30 seconds
      act(() => {
        vi.advanceTimersByTime(31000)
      })

      // Third event after 30 seconds should be shown
      const thirdEvent = {
        type: StatusEventType.SYSTEM_DEGRADED,
        source: 'system',
        data: {},
        timestamp: Date.now() + 31000
      }

      act(() => {
        mockEventListener(thirdEvent)
      })

      await waitFor(() => {
        expect(screen.getByText('System Performance Degraded')).toBeInTheDocument()
      })

      vi.useRealTimers()
    })
  })

  describe('Positioning', () => {
    it('applies top positioning by default', () => {
      render(<ConnectionStatusBanner />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      const banner = document.querySelector('.fixed')
      expect(banner).toHaveClass('top-0')
    })

    it('applies bottom positioning when specified', () => {
      render(<ConnectionStatusBanner position="bottom" />)

      const event = {
        type: StatusEventType.CIRCUIT_BREAKER_OPENED,
        source: 'test-service',
        data: {},
        timestamp: Date.now()
      }

      act(() => {
        mockEventListener(event)
      })

      const banner = document.querySelector('.fixed')
      expect(banner).toHaveClass('bottom-0')
    })
  })

  describe('Close Button Visibility', () => {
    it('shows close button by default', async () => {
      render(<ConnectionStatusBanner />)

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
        expect(screen.getByRole('button', {name: /dismiss notification/i})).toBeInTheDocument()
      })
    })

    it('hides close button when showCloseButton is false', async () => {
      render(<ConnectionStatusBanner showCloseButton={false} />)

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
        expect(screen.getByText('Service Temporarily Unavailable')).toBeInTheDocument()
        expect(
          screen.queryByRole('button', {name: /dismiss notification/i})
        ).not.toBeInTheDocument()
      })
    })
  })
})
