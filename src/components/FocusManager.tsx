import React, { useEffect, useRef } from 'react';
import { useWindowState } from '../contexts/WindowStateProvider';
import { useSharedState } from '../hooks/useSharedState';

interface FocusManagerProps {
  children: React.ReactNode;
  autoFocus?: boolean;
  trapFocus?: boolean;
  restoreFocus?: boolean;
}

export const FocusManager: React.FC<FocusManagerProps> = ({
  children,
  autoFocus = false,
  trapFocus = false,
  restoreFocus = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const { windowState } = useWindowState();
  const { onMessage } = useSharedState();

  // Store the previously focused element when component mounts
  useEffect(() => {
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement;
    }
  }, [restoreFocus]);

  // Auto-focus the first focusable element
  useEffect(() => {
    if (autoFocus && containerRef.current) {
      const focusableElement = getFocusableElements(containerRef.current)[0];
      if (focusableElement) {
        (focusableElement as HTMLElement).focus();
      }
    }
  }, [autoFocus]);

  // Listen for focus commands from other windows
  useEffect(() => {
    const removeListener = onMessage((channel: string, ...args: any[]) => {
      if (channel === 'focus-element' && args[0] === windowState.windowId) {
        const selector = args[1];
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
          element.focus();
        }
      } else if (channel === 'focus-first-element' && args[0] === windowState.windowId) {
        if (containerRef.current) {
          const focusableElement = getFocusableElements(containerRef.current)[0];
          if (focusableElement) {
            (focusableElement as HTMLElement).focus();
          }
        }
      }
    });

    return removeListener;
  }, [onMessage, windowState.windowId]);

  // Handle focus trapping
  useEffect(() => {
    if (!trapFocus || !containerRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(containerRef.current!);
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [trapFocus]);

  // Restore focus when component unmounts
  useEffect(() => {
    return () => {
      if (restoreFocus && previousActiveElement.current) {
        (previousActiveElement.current as HTMLElement).focus?.();
      }
    };
  }, [restoreFocus]);

  return (
    <div ref={containerRef} className="focus-manager">
      {children}
    </div>
  );
};

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
  ].join(', ');

  return Array.from(container.querySelectorAll(selector)).filter((element) => {
    return isElementVisible(element as HTMLElement);
  });
}

// Helper function to check if element is visible
function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}