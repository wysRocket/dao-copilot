/**
 * Test file for AnswerDisplayProvider functionality
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {render, screen, cleanup, act} from '@testing-library/react'
import React from 'react'
import {AnswerDisplayProvider, useAnswerDisplay} from '../contexts/AnswerDisplayProvider'

// Mock components for testing
const TestComponent = () => {
  const {currentDisplay, isInitialized, connectionStatus, startAnswerDisplay, clearCurrentDisplay} =
    useAnswerDisplay()

  return (
    <div>
      <div data-testid="initialization-status">
        {isInitialized ? 'initialized' : 'not-initialized'}
      </div>
      <div data-testid="connection-status">{connectionStatus}</div>
      <div data-testid="current-display">
        {currentDisplay ? currentDisplay.questionText : 'no-display'}
      </div>
      <button
        onClick={() => startAnswerDisplay('test-1', 'Test question?')}
        data-testid="start-display"
      >
        Start Display
      </button>
      <button onClick={clearCurrentDisplay} data-testid="clear-display">
        Clear Display
      </button>
    </div>
  )
}

const TestWrapper: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AnswerDisplayProvider>{children}</AnswerDisplayProvider>
)

describe('AnswerDisplayProvider', () => {
  beforeEach(() => {
    // Reset any global state before each test
    jest.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('should provide initial state correctly', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    )

    // Initially should not be initialized
    expect(screen.getByTestId('initialization-status')).toHaveTextContent('not-initialized')
    expect(screen.getByTestId('connection-status')).toHaveTextContent('disconnected')
    expect(screen.getByTestId('current-display')).toHaveTextContent('no-display')
  })

  it('should initialize managers and update connection status', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    )

    // Wait for initialization to complete
    await act(async () => {
      // Allow async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // Should eventually be initialized (though connection may fail in test environment)
    const initStatus = screen.getByTestId('initialization-status')
    expect(initStatus.textContent).toBe('initialized')
  })

  it('should maintain state when question is started', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    )

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    // Start a display
    const startButton = screen.getByTestId('start-display')
    await act(async () => {
      startButton.click()
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Should show the question text (display manager will handle the rest)
    const displayElement = screen.getByTestId('current-display')
    expect(displayElement.textContent).toBe('Test question?')
  })

  it('should clear display when requested', async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    )

    // Wait for initialization and start display
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    const startButton = screen.getByTestId('start-display')
    await act(async () => {
      startButton.click()
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Clear the display
    const clearButton = screen.getByTestId('clear-display')
    await act(async () => {
      clearButton.click()
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Should be cleared
    const displayElement = screen.getByTestId('current-display')
    expect(displayElement.textContent).toBe('no-display')
  })
})

export {TestWrapper, TestComponent}
