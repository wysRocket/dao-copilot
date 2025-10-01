/**
 * @vitest-environment jsdom
 */

import {describe, it, expect, beforeEach, vi} from 'vitest'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import {renderHook} from '@testing-library/react'
import {useAutoScroll} from '../../hooks/useAutoScroll'
import {
  AutoScrollContainer,
  ScrollControls,
  NewContentIndicator
} from '../../components/AutoScrollComponents'

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
const mockObserve = vi.fn()
const mockUnobserve = vi.fn()
const mockDisconnect = vi.fn()

mockIntersectionObserver.mockReturnValue({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect
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

describe('Auto-scroll Hook (useAutoScroll)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Hook Functionality', () => {
    it('should initialize with default configuration', () => {
      const {result} = renderHook(() => useAutoScroll())

      expect(result.current.state.isAutoScrolling).toBe(true)
      expect(result.current.state.hasUserScrolled).toBe(false)
      expect(result.current.state.hasNewContent).toBe(false)
      expect(result.current.state.scrollPercentage).toBe(100)
      expect(result.current.containerRef).toBeDefined()
      expect(result.current.controls).toBeDefined()
    })

    it('should initialize with custom configuration', () => {
      const customConfig = {
        enabled: false,
        bottomThreshold: 100,
        smooth: false
      }

      const {result} = renderHook(() => useAutoScroll(customConfig))

      expect(result.current.state.isAutoScrolling).toBe(false)
    })

    it('should provide control methods', () => {
      const {result} = renderHook(() => useAutoScroll())

      expect(typeof result.current.controls.scrollToBottom).toBe('function')
      expect(typeof result.current.controls.scrollToTop).toBe('function')
      expect(typeof result.current.controls.enableAutoScroll).toBe('function')
      expect(typeof result.current.controls.disableAutoScroll).toBe('function')
      expect(typeof result.current.controls.toggleAutoScroll).toBe('function')
    })
  })

  describe('Auto-scroll Control', () => {
    it('should enable auto-scroll', () => {
      const {result} = renderHook(() => useAutoScroll({enabled: false}))

      act(() => {
        result.current.controls.enableAutoScroll()
      })

      expect(result.current.state.isAutoScrolling).toBe(true)
    })

    it('should disable auto-scroll', () => {
      const {result} = renderHook(() => useAutoScroll())

      act(() => {
        result.current.controls.disableAutoScroll()
      })

      expect(result.current.state.isAutoScrolling).toBe(false)
    })

    it('should toggle auto-scroll', () => {
      const {result} = renderHook(() => useAutoScroll())

      const initialState = result.current.state.isAutoScrolling

      act(() => {
        result.current.controls.toggleAutoScroll()
      })

      expect(result.current.state.isAutoScrolling).toBe(!initialState)
    })

    it('should provide scroll control methods', () => {
      const {result} = renderHook(() => useAutoScroll())

      act(() => {
        result.current.controls.scrollToBottom()
        result.current.controls.scrollToTop()
        result.current.controls.scrollToPosition(50)
      })

      // Should not throw errors
      expect(result.current.controls).toBeDefined()
    })
  })

  describe('State Management', () => {
    it('should track scroll percentage', () => {
      const {result} = renderHook(() => useAutoScroll())

      expect(typeof result.current.state.scrollPercentage).toBe('number')
      expect(result.current.state.scrollPercentage).toBeGreaterThanOrEqual(0)
      expect(result.current.state.scrollPercentage).toBeLessThanOrEqual(100)
    })

    it('should track distance from bottom', () => {
      const {result} = renderHook(() => useAutoScroll())

      expect(typeof result.current.state.distanceFromBottom).toBe('number')
      expect(result.current.state.distanceFromBottom).toBeGreaterThanOrEqual(0)
    })

    it('should track if container is scrollable', () => {
      const {result} = renderHook(() => useAutoScroll())

      expect(typeof result.current.state.isScrollable).toBe('boolean')
    })
  })

  describe('New Content Handling', () => {
    it('should provide onNewContent callback', () => {
      const {result} = renderHook(() => useAutoScroll())

      expect(typeof result.current.onNewContent).toBe('function')
    })

    it('should handle new content notification', () => {
      const {result} = renderHook(() => useAutoScroll())

      act(() => {
        result.current.onNewContent()
      })

      // Should not throw errors
      expect(result.current.onNewContent).toBeDefined()
    })
  })
})

describe('AutoScrollContainer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render children correctly', () => {
    render(
      <AutoScrollContainer>
        <div data-testid="child">Test content</div>
      </AutoScrollContainer>
    )

    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    render(
      <AutoScrollContainer className="custom-class">
        <div>Content</div>
      </AutoScrollContainer>
    )

    const container = document.querySelector('.auto-scroll-container')
    expect(container).toHaveClass('custom-class')
  })

  it('should render with default configuration', () => {
    render(
      <AutoScrollContainer>
        <div>Test content</div>
      </AutoScrollContainer>
    )

    const container = document.querySelector('.auto-scroll-container')
    expect(container).toBeInTheDocument()
  })

  it('should handle custom configuration', () => {
    const config = {
      enabled: false,
      showControls: false,
      showNewContentIndicator: false
    }

    render(
      <AutoScrollContainer config={config}>
        <div>Content</div>
      </AutoScrollContainer>
    )

    const container = document.querySelector('.auto-scroll-container')
    expect(container).toBeInTheDocument()
  })

  it('should call onScrollStateChange callback', async () => {
    const onScrollStateChange = vi.fn()

    render(
      <AutoScrollContainer onScrollStateChange={onScrollStateChange}>
        <div>Content</div>
      </AutoScrollContainer>
    )

    // Should call the callback with initial state
    await waitFor(() => {
      expect(onScrollStateChange).toHaveBeenCalled()
    })
  })
})

describe('ScrollControls Component', () => {
  const defaultProps = {
    isAutoScrolling: true,
    hasNewContent: false,
    scrollPercentage: 50,
    isScrollable: true,
    onToggleAutoScroll: vi.fn(),
    onScrollToTop: vi.fn(),
    onScrollToBottom: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render controls when scrollable', () => {
    render(<ScrollControls {...defaultProps} />)

    const controls = screen.getByRole('group')
    expect(controls).toBeInTheDocument()
  })

  it('should not render when not scrollable', () => {
    render(<ScrollControls {...defaultProps} isScrollable={false} />)

    const controls = document.querySelector('.scroll-controls')
    expect(controls).not.toBeInTheDocument()
  })

  it('should render toggle button', () => {
    render(<ScrollControls {...defaultProps} />)

    const toggleButton = screen.getByLabelText(/auto-scroll/i)
    expect(toggleButton).toBeInTheDocument()
  })

  it('should render scroll to top button', () => {
    render(<ScrollControls {...defaultProps} />)

    const topButton = screen.getByLabelText(/scroll to top/i)
    expect(topButton).toBeInTheDocument()
  })

  it('should render scroll to bottom button', () => {
    render(<ScrollControls {...defaultProps} />)

    const bottomButton = screen.getByLabelText(/scroll to bottom/i)
    expect(bottomButton).toBeInTheDocument()
  })

  it('should display scroll percentage', () => {
    render(<ScrollControls {...defaultProps} scrollPercentage={75} />)

    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('should call onToggleAutoScroll when toggle button clicked', () => {
    const onToggleAutoScroll = vi.fn()
    render(<ScrollControls {...defaultProps} onToggleAutoScroll={onToggleAutoScroll} />)

    const toggleButton = screen.getByLabelText(/auto-scroll/i)
    fireEvent.click(toggleButton)

    expect(onToggleAutoScroll).toHaveBeenCalled()
  })

  it('should call onScrollToTop when top button clicked', () => {
    const onScrollToTop = vi.fn()
    render(<ScrollControls {...defaultProps} onScrollToTop={onScrollToTop} />)

    const topButton = screen.getByLabelText(/scroll to top/i)
    fireEvent.click(topButton)

    expect(onScrollToTop).toHaveBeenCalled()
  })

  it('should call onScrollToBottom when bottom button clicked', () => {
    const onScrollToBottom = vi.fn()
    render(<ScrollControls {...defaultProps} onScrollToBottom={onScrollToBottom} />)

    const bottomButton = screen.getByLabelText(/scroll to bottom/i)
    fireEvent.click(bottomButton)

    expect(onScrollToBottom).toHaveBeenCalled()
  })

  it('should show active state for auto-scroll button', () => {
    render(<ScrollControls {...defaultProps} isAutoScrolling={true} />)

    const toggleButton = screen.getByLabelText(/disable auto-scroll/i)
    expect(toggleButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('should show highlight when new content available', () => {
    render(<ScrollControls {...defaultProps} hasNewContent={true} />)

    const bottomButton = screen.getByLabelText(/scroll to bottom/i)
    expect(bottomButton).toHaveClass('scroll-controls__button--highlight')
  })
})

describe('NewContentIndicator Component', () => {
  const defaultProps = {
    visible: true,
    onClick: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render when visible', () => {
    render(<NewContentIndicator {...defaultProps} />)

    const indicator = screen.getByRole('button')
    expect(indicator).toBeInTheDocument()
  })

  it('should not render when not visible', () => {
    render(<NewContentIndicator {...defaultProps} visible={false} />)

    const indicator = document.querySelector('.new-content-indicator')
    expect(indicator).not.toBeInTheDocument()
  })

  it('should display default message', () => {
    render(<NewContentIndicator {...defaultProps} />)

    expect(screen.getByText('New content available')).toBeInTheDocument()
  })

  it('should display custom message', () => {
    const customMessage = 'Custom new content message'
    render(<NewContentIndicator {...defaultProps} message={customMessage} />)

    expect(screen.getByText(customMessage)).toBeInTheDocument()
  })

  it('should display new content count', () => {
    render(<NewContentIndicator {...defaultProps} newContentCount={5} />)

    expect(screen.getByText('5 new messages')).toBeInTheDocument()
  })

  it('should handle singular count', () => {
    render(<NewContentIndicator {...defaultProps} newContentCount={1} />)

    expect(screen.getByText('1 new message')).toBeInTheDocument()
  })

  it('should call onClick when clicked', () => {
    const onClick = vi.fn()
    render(<NewContentIndicator {...defaultProps} onClick={onClick} />)

    const indicator = screen.getByRole('button')
    fireEvent.click(indicator)

    expect(onClick).toHaveBeenCalled()
  })

  it('should handle keyboard navigation', () => {
    const onClick = vi.fn()
    render(<NewContentIndicator {...defaultProps} onClick={onClick} />)

    const indicator = screen.getByRole('button')

    // Test Enter key
    fireEvent.keyDown(indicator, {key: 'Enter'})
    expect(onClick).toHaveBeenCalled()

    // Test Space key
    fireEvent.keyDown(indicator, {key: ' '})
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('should have proper accessibility attributes', () => {
    render(<NewContentIndicator {...defaultProps} />)

    const indicator = screen.getByRole('button')
    expect(indicator).toHaveAttribute('aria-label')
    expect(indicator).toHaveAttribute('tabIndex', '0')
  })

  it('should apply variant classes', () => {
    render(<NewContentIndicator {...defaultProps} variant="floating" />)

    const indicator = document.querySelector('.new-content-indicator--floating')
    expect(indicator).toBeInTheDocument()
  })

  it('should apply animation classes', () => {
    render(<NewContentIndicator {...defaultProps} animation="bounce" />)

    const indicator = document.querySelector('.new-content-indicator--bounce')
    expect(indicator).toBeInTheDocument()
  })
})

describe('Integration Tests', () => {
  it('should work together in a complete auto-scroll setup', async () => {
    const TestComponent = () => {
      return (
        <AutoScrollContainer
          config={{
            enabled: true,
            showControls: true,
            showNewContentIndicator: true
          }}
        >
          <div>Line 1</div>
          <div>Line 2</div>
          <div>Line 3</div>
        </AutoScrollContainer>
      )
    }

    render(<TestComponent />)

    // Container should render
    const container = document.querySelector('.auto-scroll-container')
    expect(container).toBeInTheDocument()

    // Content should render
    expect(screen.getByText('Line 1')).toBeInTheDocument()
    expect(screen.getByText('Line 2')).toBeInTheDocument()
    expect(screen.getByText('Line 3')).toBeInTheDocument()
  })

  it('should handle content updates gracefully', async () => {
    const TestComponent = () => {
      const [lines, setLines] = React.useState(['Line 1'])

      React.useEffect(() => {
        const timer = setTimeout(() => {
          setLines(prev => [...prev, 'Line 2', 'Line 3'])
        }, 100)

        return () => clearTimeout(timer)
      }, [])

      return (
        <AutoScrollContainer>
          {lines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </AutoScrollContainer>
      )
    }

    render(<TestComponent />)

    // Initial content
    expect(screen.getByText('Line 1')).toBeInTheDocument()

    // Wait for content to be added
    await waitFor(() => {
      expect(screen.getByText('Line 2')).toBeInTheDocument()
      expect(screen.getByText('Line 3')).toBeInTheDocument()
    })
  })

  it('should handle configuration changes', () => {
    const TestComponent = () => {
      const [showControls, setShowControls] = React.useState(true)

      return (
        <div>
          <button onClick={() => setShowControls(!showControls)}>Toggle Controls</button>
          <AutoScrollContainer
            config={{
              showControls,
              showNewContentIndicator: true
            }}
          >
            <div>Content</div>
          </AutoScrollContainer>
        </div>
      )
    }

    render(<TestComponent />)

    expect(screen.getByText('Content')).toBeInTheDocument()

    // Toggle controls
    const toggleButton = screen.getByText('Toggle Controls')
    fireEvent.click(toggleButton)

    // Should still work
    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
