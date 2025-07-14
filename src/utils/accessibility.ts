/**
 * Accessibility utilities for the DAO Copilot application
 * Provides comprehensive accessibility support including ARIA, screen reader compatibility,
 * keyboard navigation, and user preference detection.
 */

/**
 * User accessibility preferences
 */
export interface AccessibilityPreferences {
  reducedMotion: boolean;
  highContrast: boolean;
  forceFocus: boolean;
  announceChanges: boolean;
  keyboardNavigation: boolean;
  screenReaderOptimized: boolean;
}

/**
 * ARIA live region types
 */
export type AriaLiveType = 'off' | 'polite' | 'assertive';

/**
 * Screen reader announcement priority
 */
export type AnnouncementPriority = 'low' | 'medium' | 'high';

/**
 * Accessibility context for components
 */
export interface AccessibilityContext {
  isScreenReaderActive: boolean;
  preferences: AccessibilityPreferences;
  announceToScreenReader: (text: string, priority?: AnnouncementPriority) => void;
  setFocusOnElement: (element: HTMLElement, options?: FocusOptions) => void;
  createAriaLiveRegion: (type: AriaLiveType) => HTMLElement;
}

/**
 * Detect user accessibility preferences from browser APIs
 */
export const detectAccessibilityPreferences = (): AccessibilityPreferences => {
  const hasReducedMotion = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };

  const hasHighContrast = () => {
    try {
      return window.matchMedia('(prefers-contrast: high)').matches ||
             window.matchMedia('(-ms-high-contrast: active)').matches;
    } catch {
      return false;
    }
  };

  const hasForcedColors = () => {
    try {
      return window.matchMedia('(forced-colors: active)').matches;
    } catch {
      return false;
    }
  };

  return {
    reducedMotion: hasReducedMotion(),
    highContrast: hasHighContrast() || hasForcedColors(),
    forceFocus: hasForcedColors(),
    announceChanges: true, // Default to true for better accessibility
    keyboardNavigation: true, // Default to true
    screenReaderOptimized: isScreenReaderDetected(),
  };
};

/**
 * Detect if a screen reader is likely active
 */
export const isScreenReaderDetected = (): boolean => {
  // Check for common screen reader indicators
  try {
    // Check for NVDA
    if ('speechSynthesis' in window && window.speechSynthesis.getVoices().length > 0) {
      return true;
    }

    // Check for high contrast mode (often used with screen readers)
    if (window.matchMedia('(-ms-high-contrast: active)').matches) {
      return true;
    }

    // Check for forced colors (Windows high contrast)
    if (window.matchMedia('(forced-colors: active)').matches) {
      return true;
    }

    // Check for accessibility API usage (not always reliable)
    return document.documentElement.getAttribute('aria-hidden') !== null;
  } catch {
    return false;
  }
};

/**
 * Create and manage an ARIA live region for announcements
 */
export class AriaLiveRegionManager {
  private regions: Map<AriaLiveType, HTMLElement> = new Map();
  private announceQueue: Array<{ text: string; priority: AnnouncementPriority; timestamp: number }> = [];
  private isProcessing = false;

  constructor() {
    this.createLiveRegions();
  }

  /**
   * Create ARIA live regions for different announcement types
   */
  private createLiveRegions(): void {
    const types: AriaLiveType[] = ['polite', 'assertive'];
    
    types.forEach(type => {
      const region = document.createElement('div');
      region.setAttribute('aria-live', type);
      region.setAttribute('aria-atomic', 'true');
      region.setAttribute('role', 'status');
      region.style.position = 'absolute';
      region.style.left = '-10000px';
      region.style.width = '1px';
      region.style.height = '1px';
      region.style.overflow = 'hidden';
      
      document.body.appendChild(region);
      this.regions.set(type, region);
    });
  }

  /**
   * Announce text to screen readers
   */
  public announce(text: string, priority: AnnouncementPriority = 'medium'): void {
    if (!text.trim()) return;

    this.announceQueue.push({
      text: text.trim(),
      priority,
      timestamp: Date.now(),
    });

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the announcement queue
   */
  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.announceQueue.length > 0) {
      const announcement = this.announceQueue.shift();
      if (!announcement) continue;

      const regionType: AriaLiveType = announcement.priority === 'high' ? 'assertive' : 'polite';
      const region = this.regions.get(regionType);
      
      if (region) {
        // Clear previous announcement
        region.textContent = '';
        
        // Small delay to ensure screen readers detect the change
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Set new announcement
        region.textContent = announcement.text;
        
        // Wait before processing next announcement
        await new Promise(resolve => setTimeout(resolve, announcement.priority === 'high' ? 500 : 1000));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Clear all announcements
   */
  public clear(): void {
    this.announceQueue.length = 0;
    this.regions.forEach(region => {
      region.textContent = '';
    });
  }

  /**
   * Destroy the live regions
   */
  public destroy(): void {
    this.regions.forEach(region => {
      if (region.parentNode) {
        region.parentNode.removeChild(region);
      }
    });
    this.regions.clear();
    this.clear();
  }
}

/**
 * Focus management utilities
 */
export class FocusManager {
  private focusStack: HTMLElement[] = [];
  private trapContainer: HTMLElement | null = null;

  /**
   * Set focus on an element with proper error handling
   */
  public setFocus(element: HTMLElement, options?: FocusOptions): boolean {
    try {
      element.focus(options);
      return document.activeElement === element;
    } catch (error) {
      console.warn('Failed to set focus:', error);
      return false;
    }
  }

  /**
   * Push current focus to stack and set new focus
   */
  public pushFocus(element: HTMLElement, options?: FocusOptions): boolean {
    const currentFocus = document.activeElement as HTMLElement;
    if (currentFocus && currentFocus !== document.body) {
      this.focusStack.push(currentFocus);
    }
    return this.setFocus(element, options);
  }

  /**
   * Restore focus from stack
   */
  public popFocus(): boolean {
    const previousFocus = this.focusStack.pop();
    if (previousFocus) {
      return this.setFocus(previousFocus);
    }
    return false;
  }

  /**
   * Trap focus within a container
   */
  public trapFocus(container: HTMLElement): void {
    this.trapContainer = container;
    container.addEventListener('keydown', this.handleFocusTrap);
  }

  /**
   * Release focus trap
   */
  public releaseFocusTrap(): void {
    if (this.trapContainer) {
      this.trapContainer.removeEventListener('keydown', this.handleFocusTrap);
      this.trapContainer = null;
    }
  }

  /**
   * Handle focus trap keyboard navigation
   */
  private handleFocusTrap = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !this.trapContainer) return;

    const focusableElements = this.getFocusableElements(this.trapContainer);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        this.setFocus(lastElement);
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        this.setFocus(firstElement);
      }
    }
  };

  /**
   * Get all focusable elements within a container
   */
  public getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(', ');

    return Array.from(container.querySelectorAll(selector))
      .filter(element => this.isElementVisible(element as HTMLElement)) as HTMLElement[];
  }

  /**
   * Check if an element is visible and focusable
   */
  private isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
  }
}

/**
 * Keyboard navigation utilities
 */
export const KeyboardUtils = {
  /**
   * Check if an event is an activation key (Enter or Space)
   */
  isActivationKey(event: KeyboardEvent): boolean {
    return event.key === 'Enter' || event.key === ' ';
  },

  /**
   * Check if an event is an escape key
   */
  isEscapeKey(event: KeyboardEvent): boolean {
    return event.key === 'Escape';
  },

  /**
   * Check if an event is an arrow key
   */
  isArrowKey(event: KeyboardEvent): boolean {
    return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
  },

  /**
   * Prevent default behavior for specific keys
   */
  preventDefaultForKeys(event: KeyboardEvent, keys: string[]): boolean {
    if (keys.includes(event.key)) {
      event.preventDefault();
      return true;
    }
    return false;
  },
};

/**
 * Accessibility context provider
 */
export const createAccessibilityContext = (): AccessibilityContext => {
  const preferences = detectAccessibilityPreferences();
  const liveRegionManager = new AriaLiveRegionManager();
  const focusManager = new FocusManager();

  return {
    isScreenReaderActive: preferences.screenReaderOptimized,
    preferences,
    announceToScreenReader: (text: string, priority: AnnouncementPriority = 'medium') => {
      if (preferences.announceChanges) {
        liveRegionManager.announce(text, priority);
      }
    },
    setFocusOnElement: (element: HTMLElement, options?: FocusOptions) => {
      if (preferences.keyboardNavigation) {
        focusManager.setFocus(element, options);
      }
    },
    createAriaLiveRegion: (type: AriaLiveType) => {
      const region = document.createElement('div');
      region.setAttribute('aria-live', type);
      region.setAttribute('aria-atomic', 'true');
      return region;
    },
  };
};

/**
 * React hook for accessibility context
 */
export { useAccessibility } from '../hooks/useAccessibility';
