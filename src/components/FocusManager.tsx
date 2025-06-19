import React, {useEffect, useRef} from 'react'
import {useWindowState} from '../contexts/WindowStateProvider'
import {useSharedState} from '../hooks/useSharedState'

interface WindowInfo {
  windowId: string
  type: string
  isVisible: boolean
}

interface FocusManagerProps {
  children: React.ReactNode
  autoFocus?: boolean
  trapFocus?: boolean
  restoreFocus?: boolean
  focusBoth?: boolean // New prop to enable multi-window focus
}

export const FocusManager: React.FC<FocusManagerProps> = ({
  children,
  autoFocus = false,
  trapFocus = false,
  restoreFocus = true,
  focusBoth = false // Enable focusing both main and assistant windows
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<Element | null>(null)
  const {windowState} = useWindowState()
  const {onMessage} = useSharedState()

  // Store the previously focused element when component mounts
  useEffect(() => {
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement
    }
  }, [restoreFocus])

  // Auto-focus the first focusable element
  useEffect(() => {
    if (autoFocus && containerRef.current) {
      const focusableElement = getFocusableElements(containerRef.current)[0]
      if (focusableElement) {
        ;(focusableElement as HTMLElement).focus()
      }
    }
  }, [autoFocus])

  // Handle window restore focus behavior - MUCH more selective
  useEffect(() => {
    if (focusBoth && windowState.windowType === 'main') {
      // Only trigger dual focus on very specific events, not general window focus
      // Remove the aggressive focus listener that was causing jumping
      // Optional: You could add a more specific listener here for restoration events
      // But for now, we'll rely only on manual triggers and restoration events
    }
  }, [focusBoth, windowState.windowType])

  // Listen for focus commands from other windows
  useEffect(() => {
    const removeListener = onMessage((channel: string, ...args: unknown[]) => {
      if (channel === 'focus-element' && args[0] === windowState.windowId) {
        const selector = args[1] as string
        const element = document.querySelector(selector) as HTMLElement
        if (element) {
          element.focus()
        }
      } else if (channel === 'focus-first-element' && args[0] === windowState.windowId) {
        if (containerRef.current) {
          const focusableElement = getFocusableElements(containerRef.current)[0]
          if (focusableElement) {
            ;(focusableElement as HTMLElement).focus()
          }
        }
      } else if (channel === 'focus-both-windows' && focusBoth) {
        // Handle focusing both main and assistant windows
        handleFocusBothWindows()
      } else if (channel === 'window-restored' && windowState.windowType === 'main') {
        // When main window is restored, optionally focus assistant window too
        if (focusBoth) {
          setTimeout(() => {
            handleFocusBothWindows()
          }, 100) // Small delay to ensure main window is fully restored
        }
      } else if (
        channel === 'assistant-window-created' &&
        windowState.windowType === 'main' &&
        focusBoth
      ) {
        // When assistant window is created via global shortcut, coordinate focus if enabled
        setTimeout(() => {
          handleFocusBothWindows()
        }, 200) // Small delay to ensure assistant window is fully created
      }
    })

    return removeListener
  }, [onMessage, windowState.windowId, windowState.windowType, focusBoth])

  // Function to handle focusing both windows - Made much more conservative
  const handleFocusBothWindows = () => {
    if (!focusBoth) return

    // Focus current window first
    if (containerRef.current) {
      const focusableElement = getFocusableElements(containerRef.current)[0]
      if (focusableElement) {
        ;(focusableElement as HTMLElement).focus()
      }
    }

    // ONLY focus assistant window if this is a manual trigger or restoration event
    // Don't do it automatically on every main window focus
    if (windowState.windowType === 'main') {
      // Use electron window API to focus assistant window if it exists
      if (window.electronWindow?.getAllWindows) {
        window.electronWindow.getAllWindows().then((windows: WindowInfo[]) => {
          const assistantWindow = windows.find(w => w.type === 'assistant' && w.isVisible)
          if (assistantWindow && window.electronWindow?.focusWindow) {
            setTimeout(() => {
              window.electronWindow.focusWindow(assistantWindow.windowId)
            }, 150) // Slight delay to allow main window to focus first
          }
        })
      }
    }

    // If this is the assistant window, ensure main window is visible but DON'T steal focus
    if (windowState.windowType === 'assistant') {
      if (window.electronWindow?.getAllWindows) {
        window.electronWindow.getAllWindows().then((windows: WindowInfo[]) => {
          const mainWindow = windows.find(w => w.type === 'main')
          if (mainWindow && window.electronWindow?.showWindow) {
            // Only ensure visibility, don't change focus
            window.electronWindow.showWindow(mainWindow.windowId)
          }
        })
      }
    }
  }

  // Handle focus trapping
  useEffect(() => {
    if (!trapFocus || !containerRef.current) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(containerRef.current!)
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [trapFocus])

  // Restore focus when component unmounts
  useEffect(() => {
    return () => {
      if (restoreFocus && previousActiveElement.current) {
        ;(previousActiveElement.current as HTMLElement).focus?.()
      }
    }
  }, [restoreFocus])

  return (
    <div ref={containerRef} className="focus-manager">
      {children}
    </div>
  )
}

// Helper function to get all focusable elements
function getFocusableElements(container: HTMLElement): Element[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ')

  return Array.from(container.querySelectorAll(selector)).filter(element => {
    return isElementVisible(element as HTMLElement)
  })
}

// Helper function to check if element is visible
function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  )
}
