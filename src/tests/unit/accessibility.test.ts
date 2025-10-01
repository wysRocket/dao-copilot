/**
 * @jest-environment jsdom
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  detectAccessibilityPreferences,
  isScreenReaderDetected,
  AriaLiveRegionManager,
  FocusManager,
  KeyboardUtils
} from '../../utils/accessibility'

const jest = vi

type TestWindow = Omit<typeof window, 'matchMedia' | 'speechSynthesis'> & {
  matchMedia: ReturnType<typeof vi.fn>
  speechSynthesis?: {getVoices: () => Array<{name: string}>} | undefined
}

const testWindow = window as unknown as TestWindow

// Mock window.matchMedia
const mockMatchMedia = (matches: boolean) => ({
  matches,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
})

const setOffsetParent = (element: HTMLElement, parent: HTMLElement | null = document.body) => {
  Object.defineProperty(element, 'offsetParent', {
    configurable: true,
    value: parent
  })
}

describe('Accessibility Utils', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''

    // Mock window.matchMedia
    testWindow.matchMedia = jest.fn().mockImplementation(() => mockMatchMedia(false))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('detectAccessibilityPreferences', () => {
    it('should detect reduced motion preference', () => {
      testWindow.matchMedia = jest.fn().mockImplementation((query: string) => {
        if (query === '(prefers-reduced-motion: reduce)') {
          return mockMatchMedia(true)
        }
        return mockMatchMedia(false)
      })

      const preferences = detectAccessibilityPreferences()
      expect(preferences.reducedMotion).toBe(true)
    })

    it('should detect high contrast preference', () => {
      testWindow.matchMedia = jest.fn().mockImplementation((query: string) => {
        if (query === '(prefers-contrast: high)') {
          return mockMatchMedia(true)
        }
        return mockMatchMedia(false)
      })

      const preferences = detectAccessibilityPreferences()
      expect(preferences.highContrast).toBe(true)
    })

    it('should detect forced colors preference', () => {
      testWindow.matchMedia = jest.fn().mockImplementation((query: string) => {
        if (query === '(forced-colors: active)') {
          return mockMatchMedia(true)
        }
        return mockMatchMedia(false)
      })

      const preferences = detectAccessibilityPreferences()
      expect(preferences.highContrast).toBe(true)
    })

    it('should handle matchMedia errors gracefully', () => {
      testWindow.matchMedia = jest.fn().mockImplementation(() => {
        throw new Error('matchMedia not supported')
      })

      const preferences = detectAccessibilityPreferences()
      expect(preferences.reducedMotion).toBe(false)
      expect(preferences.highContrast).toBe(false)
    })

    it('should set default values correctly', () => {
      const preferences = detectAccessibilityPreferences()
      expect(preferences.announceChanges).toBe(true)
      expect(preferences.keyboardNavigation).toBe(true)
    })
  })

  describe('isScreenReaderDetected', () => {
    it('should detect screen reader when speechSynthesis is available', () => {
      // Mock speechSynthesis
      testWindow.speechSynthesis = {
        getVoices: jest.fn().mockReturnValue([{name: 'Test Voice'}])
      }

      const isDetected = isScreenReaderDetected()
      expect(isDetected).toBe(true)
    })

    it('should detect screen reader with high contrast mode', () => {
      testWindow.matchMedia = jest.fn().mockImplementation((query: string) => {
        if (query === '(-ms-high-contrast: active)') {
          return mockMatchMedia(true)
        }
        return mockMatchMedia(false)
      })

      const isDetected = isScreenReaderDetected()
      expect(isDetected).toBe(true)
    })

    it('should return false when no indicators are present', () => {
      testWindow.speechSynthesis = undefined

      const isDetected = isScreenReaderDetected()
      expect(isDetected).toBe(false)
    })

    it('should handle errors gracefully', () => {
      testWindow.speechSynthesis = {
        getVoices: jest.fn().mockImplementation(() => {
          throw new Error('Speech synthesis error')
        })
      }

      const isDetected = isScreenReaderDetected()
      expect(isDetected).toBe(false)
    })
  })

  describe('AriaLiveRegionManager', () => {
    let manager: AriaLiveRegionManager

    beforeEach(() => {
      manager = new AriaLiveRegionManager()
    })

    afterEach(() => {
      manager.destroy()
    })

    it('should create live regions in the DOM', () => {
      const politeRegions = document.querySelectorAll('[aria-live="polite"]')
      const assertiveRegions = document.querySelectorAll('[aria-live="assertive"]')

      expect(politeRegions.length).toBeGreaterThan(0)
      expect(assertiveRegions.length).toBeGreaterThan(0)
    })

    it('should announce text to appropriate regions', async () => {
      jest.useFakeTimers()

      manager.announce('Test message', 'medium')

      await jest.runAllTimersAsync()

      const politeRegion = document.querySelector('[aria-live="polite"]')
      expect(politeRegion?.textContent).toBe('Test message')

      jest.useRealTimers()
    })

    it('should handle high priority announcements', async () => {
      manager.announce('Important message', 'high')

      await new Promise(resolve => setTimeout(resolve, 100))

      const assertiveRegion = document.querySelector('[aria-live="assertive"]')
      expect(assertiveRegion?.textContent).toBe('Important message')
    })

    it('should clear announcements', () => {
      manager.announce('Test message', 'medium')
      manager.clear()

      const regions = document.querySelectorAll('[aria-live]')
      regions.forEach(region => {
        expect(region.textContent).toBe('')
      })
    })

    it('should destroy regions properly', () => {
      const initialRegions = document.querySelectorAll('[aria-live]').length
      manager.destroy()

      const remainingRegions = document.querySelectorAll('[aria-live]').length
      expect(remainingRegions).toBeLessThan(initialRegions)
    })

    it('should ignore empty announcements', () => {
      manager.announce('', 'medium')
      manager.announce('   ', 'medium')

      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('')
    })

    it('should queue multiple announcements', async () => {
      jest.useFakeTimers()

      manager.announce('First message', 'medium')
      manager.announce('Second message', 'medium')
      manager.announce('Third message', 'medium')

      await jest.runAllTimersAsync()

      const politeRegion = document.querySelector('[aria-live="polite"]')
      expect(politeRegion?.textContent).toBe('Third message')

      jest.useRealTimers()
    })
  })

  describe('FocusManager', () => {
    let manager: FocusManager
    let button1: HTMLButtonElement
    let button2: HTMLButtonElement

    beforeEach(() => {
      manager = new FocusManager()

      // Create test elements
      button1 = document.createElement('button')
      button1.textContent = 'Button 1'
      document.body.appendChild(button1)
      setOffsetParent(button1)

      button2 = document.createElement('button')
      button2.textContent = 'Button 2'
      document.body.appendChild(button2)
      setOffsetParent(button2)
    })

    it('should set focus on element', () => {
      const result = manager.setFocus(button1)

      expect(result).toBe(true)
      expect(document.activeElement).toBe(button1)
    })

    it('should handle focus errors gracefully', () => {
      // Create a detached element that can't receive focus
      const detachedElement = document.createElement('div')

      const result = manager.setFocus(detachedElement as HTMLElement)
      expect(result).toBe(false)
    })

    it('should manage focus stack', () => {
      button1.focus()
      expect(document.activeElement).toBe(button1)

      manager.pushFocus(button2)
      expect(document.activeElement).toBe(button2)

      manager.popFocus()
      expect(document.activeElement).toBe(button1)
    })

    it('should get focusable elements', () => {
      const container = document.createElement('div')
      const input = document.createElement('input')
      const select = document.createElement('select')
      const disabledButton = document.createElement('button')
      disabledButton.disabled = true

      container.appendChild(input)
      container.appendChild(select)
      container.appendChild(disabledButton)
      document.body.appendChild(container)

      setOffsetParent(container)
      setOffsetParent(input, container)
      setOffsetParent(select, container)
      setOffsetParent(disabledButton, null)

      const focusableElements = manager.getFocusableElements(container)

      expect(focusableElements).toContain(input)
      expect(focusableElements).toContain(select)
      expect(focusableElements).not.toContain(disabledButton)
    })

    it('should handle focus trap', () => {
      const container = document.createElement('div')
      const firstButton = document.createElement('button')
      const lastButton = document.createElement('button')

      container.appendChild(firstButton)
      container.appendChild(lastButton)
      document.body.appendChild(container)

      setOffsetParent(container)
      setOffsetParent(firstButton, container)
      setOffsetParent(lastButton, container)

      manager.trapFocus(container)

      // Simulate Tab key on last element
      lastButton.focus()
      const tabEvent = new KeyboardEvent('keydown', {key: 'Tab'})
      container.dispatchEvent(tabEvent)

      // Focus should wrap to the first element in the trap
      expect(document.activeElement).toBe(firstButton)

      manager.releaseFocusTrap()
    })

    it('should handle Shift+Tab in focus trap', () => {
      const container = document.createElement('div')
      const firstButton = document.createElement('button')
      const lastButton = document.createElement('button')

      container.appendChild(firstButton)
      container.appendChild(lastButton)
      document.body.appendChild(container)

      setOffsetParent(container)
      setOffsetParent(firstButton, container)
      setOffsetParent(lastButton, container)

      manager.trapFocus(container)

      // Simulate Shift+Tab key on first element
      firstButton.focus()
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true
      })
      container.dispatchEvent(shiftTabEvent)

      expect(document.activeElement).toBe(lastButton)

      manager.releaseFocusTrap()
    })
  })

  describe('KeyboardUtils', () => {
    it('should identify activation keys', () => {
      const enterEvent = new KeyboardEvent('keydown', {key: 'Enter'})
      const spaceEvent = new KeyboardEvent('keydown', {key: ' '})
      const tabEvent = new KeyboardEvent('keydown', {key: 'Tab'})

      expect(KeyboardUtils.isActivationKey(enterEvent)).toBe(true)
      expect(KeyboardUtils.isActivationKey(spaceEvent)).toBe(true)
      expect(KeyboardUtils.isActivationKey(tabEvent)).toBe(false)
    })

    it('should identify escape key', () => {
      const escapeEvent = new KeyboardEvent('keydown', {key: 'Escape'})
      const enterEvent = new KeyboardEvent('keydown', {key: 'Enter'})

      expect(KeyboardUtils.isEscapeKey(escapeEvent)).toBe(true)
      expect(KeyboardUtils.isEscapeKey(enterEvent)).toBe(false)
    })

    it('should identify arrow keys', () => {
      const upEvent = new KeyboardEvent('keydown', {key: 'ArrowUp'})
      const downEvent = new KeyboardEvent('keydown', {key: 'ArrowDown'})
      const leftEvent = new KeyboardEvent('keydown', {key: 'ArrowLeft'})
      const rightEvent = new KeyboardEvent('keydown', {key: 'ArrowRight'})
      const enterEvent = new KeyboardEvent('keydown', {key: 'Enter'})

      expect(KeyboardUtils.isArrowKey(upEvent)).toBe(true)
      expect(KeyboardUtils.isArrowKey(downEvent)).toBe(true)
      expect(KeyboardUtils.isArrowKey(leftEvent)).toBe(true)
      expect(KeyboardUtils.isArrowKey(rightEvent)).toBe(true)
      expect(KeyboardUtils.isArrowKey(enterEvent)).toBe(false)
    })

    it('should prevent default for specified keys', () => {
      const enterEvent = new KeyboardEvent('keydown', {key: 'Enter'})
      const spyPreventDefault = jest.spyOn(enterEvent, 'preventDefault')

      const result = KeyboardUtils.preventDefaultForKeys(enterEvent, ['Enter', 'Space'])

      expect(result).toBe(true)
      expect(spyPreventDefault).toHaveBeenCalled()
    })

    it('should not prevent default for unspecified keys', () => {
      const tabEvent = new KeyboardEvent('keydown', {key: 'Tab'})
      const spyPreventDefault = jest.spyOn(tabEvent, 'preventDefault')

      const result = KeyboardUtils.preventDefaultForKeys(tabEvent, ['Enter', 'Space'])

      expect(result).toBe(false)
      expect(spyPreventDefault).not.toHaveBeenCalled()
    })
  })
})
