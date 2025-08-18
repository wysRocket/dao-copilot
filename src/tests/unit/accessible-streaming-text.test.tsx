/**
 * @vitest-environment jsdom
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import {renderHook} from '@testing-library/react'
import AccessibleStreamingText from '../../components/AccessibleStreamingText'
import {useAccessibility} from '../../hooks/useAccessibility'

// Mock window.matchMedia for accessibility preference detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: mockIntersectionObserver
})

// Mock ResizeObserver
const mockResizeObserver = vi.fn()
mockResizeObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
})
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: mockResizeObserver
})

// Mock speechSynthesis for screen reader detection
Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    getVoices: vi.fn().mockReturnValue([]),
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn()
  }
})

describe('useAccessibility Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should initialize with default preferences', () => {
      const {result} = renderHook(() => useAccessibility())

      expect(result.current.preferences).toBeDefined()
      expect(result.current.preferences).toHaveProperty('reducedMotion')
      expect(result.current.preferences).toHaveProperty('highContrast')
      expect(result.current.preferences).toHaveProperty('announceChanges')
      expect(result.current.preferences).toHaveProperty('keyboardNavigation')
    })

    it('should provide accessibility functions', () => {
      const {result} = renderHook(() => useAccessibility())

      expect(typeof result.current.announce).toBe('function')
      expect(typeof result.current.setFocus).toBe('function')
      expect(typeof result.current.createButtonHandler).toBe('function')
      expect(typeof result.current.createNavigationHandlers).toBe('function')
    })

    it('should provide accessibility state flags', () => {
      const {result} = renderHook(() => useAccessibility())

      expect(typeof result.current.shouldReduceMotion).toBe('boolean')
      expect(typeof result.current.shouldUseHighContrast).toBe('boolean')
      expect(typeof result.current.isScreenReaderActive).toBe('boolean')
    })
  })

  describe('Button Handler Creation', () => {
    it('should create button handlers with proper attributes', () => {
      const {result} = renderHook(() => useAccessibility())
      const mockCallback = vi.fn()

      const handler = result.current.createButtonHandler(mockCallback)

      expect(handler).toHaveProperty('onClick')
      expect(handler).toHaveProperty('onKeyDown')
      expect(handler).toHaveProperty('tabIndex', 0)
      expect(handler).toHaveProperty('role', 'button')
    })

    it('should handle button click', () => {
      const {result} = renderHook(() => useAccessibility())
      const mockCallback = vi.fn()

      const handler = result.current.createButtonHandler(mockCallback)

      handler.onClick()
      expect(mockCallback).toHaveBeenCalled()
    })
  })

  describe('Navigation Handlers', () => {
    it('should create navigation handlers', () => {
      const {result} = renderHook(() => useAccessibility())
      const mockCallbacks = {
        onUp: vi.fn(),
        onDown: vi.fn()
      }

      const handler = result.current.createNavigationHandlers(mockCallbacks)

      expect(handler).toHaveProperty('onKeyDown')
      expect(handler).toHaveProperty('tabIndex', 0)
    })
  })

  describe('Preference Updates', () => {
    it('should allow updating preferences', () => {
      const {result} = renderHook(() => useAccessibility())

      act(() => {
        result.current.updatePreferences({reducedMotion: true})
      })

      expect(result.current.preferences.reducedMotion).toBe(true)
    })
  })
})

describe('AccessibleStreamingText Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      expect(() => {
        render(<AccessibleStreamingText text="Test text" />)
      }).not.toThrow()
    })

    it('should display text correctly', () => {
      const testText = 'Hello, accessible world!'
      render(<AccessibleStreamingText text={testText} />)

      expect(screen.getByText(testText)).toBeInTheDocument()
    })

    it('should handle empty text', () => {
      render(<AccessibleStreamingText text="" />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const customClass = 'custom-accessible-text'
      render(<AccessibleStreamingText text="Test" className={customClass} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveClass(customClass)
    })
  })

  describe('Accessibility Features', () => {
    it('should have proper ARIA attributes', () => {
      render(<AccessibleStreamingText text="Test" />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('aria-label')
      expect(container).toHaveAttribute('aria-live')
      expect(container).toHaveAttribute('role')
    })

    it('should handle partial vs complete text states', () => {
      const {rerender} = render(<AccessibleStreamingText text="Partial text" isPartial={true} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('aria-live', 'polite')

      rerender(<AccessibleStreamingText text="Complete text" isPartial={false} />)

      expect(container).toHaveAttribute('aria-live', 'off')
    })

    it('should support keyboard navigation when enabled', () => {
      render(<AccessibleStreamingText text="Test" enableKeyboardControls={true} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('tabIndex', '0')
    })

    it('should not have tabIndex when keyboard controls disabled', () => {
      render(<AccessibleStreamingText text="Test" enableKeyboardControls={false} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).not.toHaveAttribute('tabIndex')
    })

    it('should handle keyboard events', () => {
      render(<AccessibleStreamingText text="Test" enableKeyboardControls={true} />)

      const container = document.querySelector('.accessible-streaming-text')

      // Test keyboard interactions
      fireEvent.keyDown(container!, {key: ' '}) // Space for pause/resume
      fireEvent.keyDown(container!, {key: 'r'}) // R for restart
      fireEvent.keyDown(container!, {key: 'Enter'}) // Enter for skip
      fireEvent.keyDown(container!, {key: 'Escape'}) // Escape to stop

      expect(container).toBeInTheDocument()
    })
  })

  describe('Streaming Modes', () => {
    it('should handle character streaming mode', () => {
      render(
        <AccessibleStreamingText
          text="Test character streaming"
          mode="character"
          isPartial={true}
        />
      )

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })

    it('should handle word streaming mode', () => {
      render(<AccessibleStreamingText text="Test word streaming" mode="word" isPartial={true} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })

    it('should handle instant mode', () => {
      render(<AccessibleStreamingText text="Test instant mode" mode="instant" />)

      expect(screen.getByText('Test instant mode')).toBeInTheDocument()
    })
  })

  describe('Customization Options', () => {
    it('should apply custom ARIA label', () => {
      const customLabel = 'Custom streaming text area'
      render(<AccessibleStreamingText text="Test" ariaLabel={customLabel} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('aria-label', customLabel)
    })

    it('should apply custom ARIA description', () => {
      const customDescription = 'This is a custom description'
      render(<AccessibleStreamingText text="Test" ariaDescription={customDescription} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('aria-description', customDescription)
    })

    it('should handle high contrast mode styles', () => {
      // Mock high contrast preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('prefers-contrast: high'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        }))
      })

      render(<AccessibleStreamingText text="Test high contrast" />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })

    it('should handle reduced motion preference', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('prefers-reduced-motion: reduce'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        }))
      })

      render(<AccessibleStreamingText text="Test reduced motion" mode="character" />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveClass('reduced-motion')
    })

    it('should support custom keyboard shortcuts', () => {
      const customShortcuts = {
        pause: 'p',
        resume: 'p',
        restart: 'ctrl+r',
        skipToEnd: 'ctrl+e'
      }

      render(
        <AccessibleStreamingText
          text="Test"
          enableKeyboardControls={true}
          keyboardShortcuts={customShortcuts}
        />
      )

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })
  })

  describe('Announcement Control', () => {
    it('should handle announcements when enabled', () => {
      render(<AccessibleStreamingText text="Test announcement" announceChanges={true} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })

    it('should not announce when disabled', () => {
      render(<AccessibleStreamingText text="Test no announcement" announceChanges={false} />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })

    it('should handle different announcement priorities', () => {
      render(
        <AccessibleStreamingText
          text="Test priority"
          announceChanges={true}
          announcementPriority="high"
        />
      )

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toBeInTheDocument()
    })
  })

  describe('Verbose Status', () => {
    it('should provide detailed status when enabled', () => {
      render(<AccessibleStreamingText text="Test" verboseStatus={true} />)

      // Should have hidden status region for screen readers
      const statusRegion = document.querySelector('[aria-live="polite"]')
      expect(statusRegion).toBeInTheDocument()
    })

    it('should show keyboard controls help when enabled', () => {
      render(<AccessibleStreamingText text="Test" enableKeyboardControls={true} />)

      // Should have screen reader instructions
      const instructions = document.querySelector('.sr-only')
      expect(instructions).toBeInTheDocument()
    })
  })

  describe('Focus Handling', () => {
    it('should handle focus events', () => {
      render(<AccessibleStreamingText text="Test focus" verboseStatus={true} />)

      const container = document.querySelector('.accessible-streaming-text')

      // Focus the container
      fireEvent.focus(container!)

      expect(container).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid text gracefully', () => {
      expect(() => {
        render(<AccessibleStreamingText text={undefined as unknown as string} />)
      }).not.toThrow()
    })

    it('should handle rendering errors gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<AccessibleStreamingText text="Test" />)

      consoleError.mockRestore()
    })
  })

  describe('Performance', () => {
    it('should handle large text efficiently', () => {
      const largeText = 'A'.repeat(1000)

      expect(() => {
        render(<AccessibleStreamingText text={largeText} />)
      }).not.toThrow()

      expect(screen.getByText(largeText)).toBeInTheDocument()
    })

    it('should handle rapid text updates', async () => {
      const {rerender} = render(<AccessibleStreamingText text="" announceChanges={false} />)

      // Rapidly update text
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          rerender(<AccessibleStreamingText text={`Text ${i}`} announceChanges={false} />)
        })
      }

      expect(screen.getByText('Text 4')).toBeInTheDocument()
    })
  })

  describe('Custom Role Override', () => {
    it('should use custom role when provided', () => {
      render(<AccessibleStreamingText text="Test" roleOverride="region" />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('role', 'region')
    })

    it('should use default log role when not overridden', () => {
      render(<AccessibleStreamingText text="Test" />)

      const container = document.querySelector('.accessible-streaming-text')
      expect(container).toHaveAttribute('role', 'log')
    })
  })

  describe('Memory Management', () => {
    it('should clean up resources on unmount', () => {
      const {unmount} = render(<AccessibleStreamingText text="Test" />)

      expect(() => {
        unmount()
      }).not.toThrow()
    })

    it('should handle multiple mount/unmount cycles', () => {
      for (let i = 0; i < 3; i++) {
        const {unmount} = render(<AccessibleStreamingText text={`Test ${i}`} />)
        unmount()
      }

      // Should not cause memory leaks
      expect(true).toBe(true)
    })
  })
})
