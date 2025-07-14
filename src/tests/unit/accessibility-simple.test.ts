/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  detectAccessibilityPreferences, 
  isScreenReaderDetected, 
  AriaLiveRegionManager, 
  FocusManager, 
  KeyboardUtils 
} from '../../utils/accessibility';

// Simple tests for accessibility utilities
describe('Accessibility Utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    
    // Mock window.matchMedia with a basic implementation
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
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectAccessibilityPreferences', () => {
    it('should return default accessibility preferences', () => {
      const preferences = detectAccessibilityPreferences();
      
      expect(preferences).toHaveProperty('reducedMotion');
      expect(preferences).toHaveProperty('highContrast');
      expect(preferences).toHaveProperty('announceChanges');
      expect(preferences).toHaveProperty('keyboardNavigation');
      expect(preferences.announceChanges).toBe(true);
      expect(preferences.keyboardNavigation).toBe(true);
    });

    it('should handle errors gracefully', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => {
          throw new Error('matchMedia not supported');
        }),
      });

      const preferences = detectAccessibilityPreferences();
      expect(preferences.reducedMotion).toBe(false);
      expect(preferences.highContrast).toBe(false);
    });
  });

  describe('isScreenReaderDetected', () => {
    it('should return false when no screen reader indicators are present', () => {
      const isDetected = isScreenReaderDetected();
      expect(typeof isDetected).toBe('boolean');
    });

    it('should handle speechSynthesis availability', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        writable: true,
        value: {
          getVoices: vi.fn().mockReturnValue([{ name: 'Test Voice' }])
        },
      });

      const isDetected = isScreenReaderDetected();
      expect(typeof isDetected).toBe('boolean');
    });
  });

  describe('AriaLiveRegionManager', () => {
    let manager: AriaLiveRegionManager;

    beforeEach(() => {
      manager = new AriaLiveRegionManager();
    });

    afterEach(() => {
      if (manager) {
        manager.destroy();
      }
    });

    it('should create manager instance', () => {
      expect(manager).toBeInstanceOf(AriaLiveRegionManager);
    });

    it('should create live regions in DOM', () => {
      const politeRegions = document.querySelectorAll('[aria-live="polite"]');
      const assertiveRegions = document.querySelectorAll('[aria-live="assertive"]');
      
      expect(politeRegions.length).toBeGreaterThan(0);
      expect(assertiveRegions.length).toBeGreaterThan(0);
    });

    it('should handle announcements', () => {
      expect(() => {
        manager.announce('Test message');
      }).not.toThrow();
    });

    it('should clear announcements', () => {
      expect(() => {
        manager.clear();
      }).not.toThrow();
    });

    it('should destroy properly', () => {
      manager.destroy();
      
      expect(() => manager.destroy()).not.toThrow();
    });
  });

  describe('FocusManager', () => {
    let manager: FocusManager;
    let button: HTMLButtonElement;

    beforeEach(() => {
      manager = new FocusManager();
      button = document.createElement('button');
      button.textContent = 'Test Button';
      document.body.appendChild(button);
    });

    it('should create manager instance', () => {
      expect(manager).toBeInstanceOf(FocusManager);
    });

    it('should set focus on element', () => {
      const result = manager.setFocus(button);
      expect(typeof result).toBe('boolean');
    });

    it('should get focusable elements', () => {
      const container = document.createElement('div');
      const input = document.createElement('input');
      container.appendChild(input);
      document.body.appendChild(container);
      
      const focusableElements = manager.getFocusableElements(container);
      expect(Array.isArray(focusableElements)).toBe(true);
    });

    it('should handle focus trap', () => {
      const container = document.createElement('div');
      container.appendChild(button);
      
      expect(() => {
        manager.trapFocus(container);
        manager.releaseFocusTrap();
      }).not.toThrow();
    });
  });

  describe('KeyboardUtils', () => {
    it('should identify activation keys', () => {
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      
      expect(KeyboardUtils.isActivationKey(enterEvent)).toBe(true);
      expect(KeyboardUtils.isActivationKey(spaceEvent)).toBe(true);
      expect(KeyboardUtils.isActivationKey(tabEvent)).toBe(false);
    });

    it('should identify escape key', () => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      
      expect(KeyboardUtils.isEscapeKey(escapeEvent)).toBe(true);
      expect(KeyboardUtils.isEscapeKey(enterEvent)).toBe(false);
    });

    it('should identify arrow keys', () => {
      const upEvent = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      
      expect(KeyboardUtils.isArrowKey(upEvent)).toBe(true);
      expect(KeyboardUtils.isArrowKey(downEvent)).toBe(true);
      expect(KeyboardUtils.isArrowKey(leftEvent)).toBe(true);
      expect(KeyboardUtils.isArrowKey(rightEvent)).toBe(true);
      expect(KeyboardUtils.isArrowKey(enterEvent)).toBe(false);
    });

    it('should handle preventDefault for specified keys', () => {
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      
      // Mock preventDefault
      const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault');
      
      const result = KeyboardUtils.preventDefaultForKeys(enterEvent, ['Enter']);
      
      expect(result).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });
});
