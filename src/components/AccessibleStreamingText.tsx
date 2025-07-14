import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '../utils/tailwind';
import { StreamingTextRenderer, StreamingTextRendererProps } from './StreamingTextRenderer';
import { useAccessibility } from '../hooks/useAccessibility';
import { KeyboardUtils } from '../utils/accessibility';
import '../styles/accessible-streaming-text.css';

/**
 * Enhanced streaming text renderer with comprehensive accessibility support
 */
export interface AccessibleStreamingTextProps extends StreamingTextRendererProps {
  /** Custom ARIA label for the text content */
  ariaLabel?: string;
  /** ARIA description for complex content */
  ariaDescription?: string;
  /** Whether to announce text changes to screen readers */
  announceChanges?: boolean;
  /** Priority for screen reader announcements */
  announcementPriority?: 'low' | 'medium' | 'high';
  /** Enable keyboard navigation controls */
  enableKeyboardControls?: boolean;
  /** Custom keyboard shortcuts */
  keyboardShortcuts?: {
    pause?: string;
    resume?: string;
    restart?: string;
    skipToEnd?: string;
  };
  /** Whether to provide detailed status updates */
  verboseStatus?: boolean;
  /** Custom role override */
  roleOverride?: string;
  /** Whether to create an isolated accessibility context */
  isolatedContext?: boolean;
}

/**
 * Accessible streaming text renderer component
 */
export const AccessibleStreamingText: React.FC<AccessibleStreamingTextProps> = ({
  text,
  isPartial = false,
  mode = 'character',
  animationSpeed = 30,
  ariaLabel,
  ariaDescription,
  announceChanges = true,
  announcementPriority = 'medium',
  enableKeyboardControls = true,
  keyboardShortcuts = {
    pause: ' ',
    resume: ' ',
    restart: 'r',
    skipToEnd: 'Enter',
  },
  verboseStatus = false,
  roleOverride,
  // isolatedContext = false, // Reserved for future use
  onAnimationComplete,
  onTextUpdate,
  onStateChange,
  ...restProps
}) => {
  // Accessibility hook
  const accessibility = useAccessibility({
    autoDetect: true,
    enableKeyboardHandling: enableKeyboardControls,
    enableFocusManagement: true,
  });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAnnouncedTextRef = useRef<string>('');
  const isUserPausedRef = useRef<boolean>(false);

  // Memoized effective animation speed (respects reduced motion preference)
  const effectiveAnimationSpeed = useMemo(() => {
    if (accessibility.shouldReduceMotion) {
      return mode === 'instant' ? animationSpeed : Math.max(animationSpeed * 5, 100);
    }
    return animationSpeed;
  }, [animationSpeed, accessibility.shouldReduceMotion, mode]);

  // Memoized effective mode (respects reduced motion preference)
  const effectiveMode = useMemo(() => {
    if (accessibility.shouldReduceMotion) {
      return 'instant';
    }
    return mode;
  }, [mode, accessibility.shouldReduceMotion]);

  // Announce text changes to screen readers
  const announceTextChange = useCallback((newText: string, partial: boolean) => {
    if (!announceChanges || !accessibility.preferences.announceChanges) return;

    // Don't announce if text hasn't changed significantly
    if (newText === lastAnnouncedTextRef.current) return;

    let announcement = '';
    
    if (verboseStatus) {
      if (partial) {
        announcement = `Receiving: ${newText}`;
      } else {
        announcement = `Complete: ${newText}`;
      }
    } else {
      // Only announce the new part for efficiency
      const previousLength = lastAnnouncedTextRef.current.length;
      const newPart = newText.slice(previousLength);
      announcement = newPart || newText;
    }

    if (announcement.trim()) {
      accessibility.announce(announcement, announcementPriority);
      lastAnnouncedTextRef.current = newText;
    }
  }, [announceChanges, accessibility, announcementPriority, verboseStatus]);

  // Enhanced text update handler
  const handleTextUpdate = useCallback((updatedText: string, partial: boolean) => {
    announceTextChange(updatedText, partial);
    onTextUpdate?.(updatedText, partial);
  }, [announceTextChange, onTextUpdate]);

  // Enhanced animation complete handler
  const handleAnimationComplete = useCallback(() => {
    if (verboseStatus) {
      accessibility.announce('Text animation complete', 'low');
    }
    onAnimationComplete?.();
  }, [accessibility, verboseStatus, onAnimationComplete]);

  // Keyboard event handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!enableKeyboardControls) return;

    const key = event.key;

    // Handle custom keyboard shortcuts
    if (key === keyboardShortcuts.pause || key === keyboardShortcuts.resume) {
      event.preventDefault();
      isUserPausedRef.current = !isUserPausedRef.current;
      
      const action = isUserPausedRef.current ? 'paused' : 'resumed';
      accessibility.announce(`Animation ${action}`, 'medium');
      return;
    }

    if (key === keyboardShortcuts.restart) {
      event.preventDefault();
      accessibility.announce('Restarting animation', 'medium');
      // Note: Restart functionality would need to be implemented in parent component
      return;
    }

    if (key === keyboardShortcuts.skipToEnd) {
      event.preventDefault();
      accessibility.announce('Skipping to end', 'medium');
      // Note: Skip functionality would need to be implemented in parent component
      return;
    }

    // Handle escape to stop animations
    if (KeyboardUtils.isEscapeKey(event.nativeEvent)) {
      event.preventDefault();
      accessibility.announce('Animation stopped', 'medium');
      return;
    }
  }, [enableKeyboardControls, keyboardShortcuts, accessibility]);

  // Focus handler
  const handleFocus = useCallback(() => {
    if (verboseStatus && text) {
      const status = isPartial ? 'partial' : 'complete';
      accessibility.announce(`Focused on ${status} text: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`, 'low');
    }
  }, [accessibility, verboseStatus, text, isPartial]);

  // Status description for screen readers
  const statusDescription = useMemo(() => {
    if (!verboseStatus) return undefined;

    const parts = [];
    
    if (isPartial) {
      parts.push('receiving partial text');
    } else {
      parts.push('text complete');
    }

    if (mode !== 'instant') {
      parts.push(`animated with ${mode} mode`);
    }

    if (accessibility.shouldReduceMotion) {
      parts.push('motion reduced for accessibility');
    }

    return parts.join(', ');
  }, [isPartial, mode, accessibility.shouldReduceMotion, verboseStatus]);

  // ARIA attributes
  const ariaAttributes = useMemo(() => {
    const attributes: Record<string, string | undefined> = {
      'aria-label': ariaLabel || 'Live streaming text',
      'aria-live': isPartial ? 'polite' : 'off',
      'aria-atomic': 'true',
      'role': roleOverride || 'log',
    };

    if (ariaDescription || statusDescription) {
      attributes['aria-description'] = ariaDescription || statusDescription;
    }

    if (enableKeyboardControls) {
      attributes['tabIndex'] = '0';
    }

    return attributes;
  }, [ariaLabel, isPartial, ariaDescription, statusDescription, enableKeyboardControls, roleOverride]);

  // CSS classes with accessibility considerations
  const containerClasses = useMemo(() => {
    return cn(
      'accessible-streaming-text',
      {
        'reduced-motion': accessibility.shouldReduceMotion,
        'high-contrast': accessibility.shouldUseHighContrast,
        'screen-reader-optimized': accessibility.isScreenReaderActive,
        'keyboard-navigable': enableKeyboardControls,
      },
      restProps.className
    );
  }, [accessibility, enableKeyboardControls, restProps.className]);

  // Announce initial text on mount
  useEffect(() => {
    if (text && announceChanges) {
      announceTextChange(text, isPartial);
    }
  }, []); // Only on mount

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      {...ariaAttributes}
    >
      {/* Screen reader instructions (only shown to screen readers) */}
      {enableKeyboardControls && (
        <div className="sr-only" aria-hidden="false">
          <p>Keyboard controls available:</p>
          <ul>
            <li>Space: Pause/resume animation</li>
            <li>R: Restart animation</li>
            <li>Enter: Skip to end</li>
            <li>Escape: Stop animation</li>
          </ul>
        </div>
      )}

      {/* Hidden status for screen readers */}
      {verboseStatus && (
        <div className="sr-only" aria-live="polite">
          Status: {statusDescription}
        </div>
      )}

      {/* Main streaming text component */}
      <StreamingTextRenderer
        {...restProps}
        text={text}
        isPartial={isPartial}
        mode={effectiveMode}
        animationSpeed={effectiveAnimationSpeed}
        onAnimationComplete={handleAnimationComplete}
        onTextUpdate={handleTextUpdate}
        onStateChange={onStateChange}
      />

      {/* Accessibility information panel (hidden by default, shown on request) */}
      {process.env.NODE_ENV === 'development' && verboseStatus && (
        <div className="accessibility-debug-panel" tabIndex={-1}>
          <h4>Accessibility Status</h4>
          <ul>
            <li>Screen Reader: {accessibility.isScreenReaderActive ? 'Active' : 'Inactive'}</li>
            <li>Reduced Motion: {accessibility.shouldReduceMotion ? 'Yes' : 'No'}</li>
            <li>High Contrast: {accessibility.shouldUseHighContrast ? 'Yes' : 'No'}</li>
            <li>Keyboard Navigation: {enableKeyboardControls ? 'Enabled' : 'Disabled'}</li>
            <li>Announcements: {announceChanges ? 'Enabled' : 'Disabled'}</li>
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Default export with display name for debugging
 */
AccessibleStreamingText.displayName = 'AccessibleStreamingText';

export default AccessibleStreamingText;
