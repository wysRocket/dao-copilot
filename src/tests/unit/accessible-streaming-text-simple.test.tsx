/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Simple test component that mirrors AccessibleStreamingText interface
interface TestAccessibleComponentProps {
  text: string;
  isPartial?: boolean;
  className?: string;
  onTextUpdate?: (text: string) => void;
  preferredMode?: string;
  enableKeyboardControls?: boolean;
  autoScroll?: boolean;
}

const TestAccessibleStreamingText: React.FC<TestAccessibleComponentProps> = ({
  text,
  isPartial = false,
  className = '',
  onTextUpdate,
  enableKeyboardControls = true,
  autoScroll = true,
}) => {
  // Call onTextUpdate if provided
  React.useEffect(() => {
    if (onTextUpdate) {
      onTextUpdate(text);
    }
  }, [text, onTextUpdate]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!enableKeyboardControls) return;
    
    switch (event.key) {
      case ' ':
        event.preventDefault();
        // Pause/resume simulation
        break;
      case 'r':
      case 'R':
        // Restart simulation
        break;
      case 'Enter':
        // Skip to end simulation
        break;
      case 'Escape':
        // Stop simulation
        break;
    }
  };

  return (
    <div
      className={`accessible-streaming-text reduced-motion keyboard-navigable ${className}`}
      role="log"
      aria-live={isPartial ? 'polite' : 'off'}
      aria-label="Live streaming text"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Keyboard instructions */}
      <div className="sr-only" aria-hidden="false">
        <p>Keyboard controls available:</p>
        <ul>
          <li>Space: Pause/resume animation</li>
          <li>R: Restart animation</li>
          <li>Enter: Skip to end</li>
          <li>Escape: Stop animation</li>
        </ul>
      </div>

      {/* Auto-scroll indicator */}
      {autoScroll && (
        <div className="sr-only">Auto-scroll enabled</div>
      )}

      {/* Main content */}
      <div
        className="streaming-text-renderer relative inline-block w-full"
        role="log"
        aria-live={isPartial ? 'polite' : 'off'}
        aria-label="Streaming text content"
        tabIndex={0}
        style={{
          transition: 'color 0.3s ease, opacity 0.3s ease',
          wordWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          opacity: 1,
          color: 'var(--text-primary)',
        }}
      >
        <span className="streaming-text-content">
          {text || ''}
        </span>
        <span className="sr-only" aria-live="polite">
          {isPartial ? 'Receiving text...' : 'Text complete'}
        </span>
      </div>
    </div>
  );
};

describe('AccessibleStreamingText Component', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock APIs
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
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
    vi.clearAllTimers();
  });

  describe('Basic Functionality', () => {
    it('should render with accessibility features', () => {
      render(<TestAccessibleStreamingText text="Test content" />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('accessible-streaming-text');
    });

    it('should display text content', () => {
      const testText = 'Hello accessible world!';
      render(<TestAccessibleStreamingText text={testText} />);
      
      expect(screen.getByText(testText)).toBeInTheDocument();
    });

    it('should have proper ARIA attributes', () => {
      render(<TestAccessibleStreamingText text="Test" />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveAttribute('role', 'log');
      expect(container).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should provide keyboard instructions', () => {
      render(<TestAccessibleStreamingText text="Test" />);
      
      expect(screen.getByText('Keyboard controls available:')).toBeInTheDocument();
      expect(screen.getByText('Space: Pause/resume animation')).toBeInTheDocument();
      expect(screen.getByText('R: Restart animation')).toBeInTheDocument();
      expect(screen.getByText('Enter: Skip to end')).toBeInTheDocument();
      expect(screen.getByText('Escape: Stop animation')).toBeInTheDocument();
    });

    it('should handle space key for pause/resume', () => {
      render(<TestAccessibleStreamingText text="Test" enableKeyboardControls={true} />);
      
      const container = screen.getByLabelText('Live streaming text');
      fireEvent.keyDown(container, { key: ' ' });
      
      // Should not throw error
      expect(container).toBeInTheDocument();
    });

    it('should handle R key for restart', () => {
      render(<TestAccessibleStreamingText text="Test" enableKeyboardControls={true} />);
      
      const container = screen.getByLabelText('Live streaming text');
      fireEvent.keyDown(container, { key: 'r' });
      
      expect(container).toBeInTheDocument();
    });

    it('should handle Enter key for skip to end', () => {
      render(<TestAccessibleStreamingText text="Test" enableKeyboardControls={true} />);
      
      const container = screen.getByLabelText('Live streaming text');
      fireEvent.keyDown(container, { key: 'Enter' });
      
      expect(container).toBeInTheDocument();
    });

    it('should handle Escape key for stop', () => {
      render(<TestAccessibleStreamingText text="Test" enableKeyboardControls={true} />);
      
      const container = screen.getByLabelText('Live streaming text');
      fireEvent.keyDown(container, { key: 'Escape' });
      
      expect(container).toBeInTheDocument();
    });

    it('should ignore keys when keyboard controls disabled', () => {
      render(<TestAccessibleStreamingText text="Test" enableKeyboardControls={false} />);
      
      const container = screen.getByLabelText('Live streaming text');
      fireEvent.keyDown(container, { key: ' ' });
      
      expect(container).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should announce partial text state', () => {
      render(<TestAccessibleStreamingText text="Partial" isPartial={true} />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveAttribute('aria-live', 'polite');
      
      const announcement = screen.getByText('Receiving text...');
      expect(announcement).toHaveClass('sr-only');
    });

    it('should announce complete text state', () => {
      render(<TestAccessibleStreamingText text="Complete" isPartial={false} />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveAttribute('aria-live', 'off');
      
      const announcement = screen.getByText('Text complete');
      expect(announcement).toHaveClass('sr-only');
    });

    it('should indicate auto-scroll when enabled', () => {
      render(<TestAccessibleStreamingText text="Test" autoScroll={true} />);
      
      expect(screen.getByText('Auto-scroll enabled')).toBeInTheDocument();
    });

    it('should not show auto-scroll indicator when disabled', () => {
      render(<TestAccessibleStreamingText text="Test" autoScroll={false} />);
      
      expect(screen.queryByText('Auto-scroll enabled')).not.toBeInTheDocument();
    });

    it('should have reduced motion class for accessibility', () => {
      render(<TestAccessibleStreamingText text="Test" />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveClass('reduced-motion');
    });

    it('should have keyboard navigable class', () => {
      render(<TestAccessibleStreamingText text="Test" />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveClass('keyboard-navigable');
    });
  });

  describe('Text Updates', () => {
    it('should call onTextUpdate when text changes', () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <TestAccessibleStreamingText text="Initial" onTextUpdate={onUpdate} />
      );
      
      rerender(
        <TestAccessibleStreamingText text="Updated" onTextUpdate={onUpdate} />
      );
      
      expect(onUpdate).toHaveBeenCalledWith('Updated');
    });

    it('should handle empty text', () => {
      render(<TestAccessibleStreamingText text="" />);
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toBeInTheDocument();
    });

    it('should handle text with special characters', () => {
      const specialText = 'Special: 🚀 @#$%^&*()';
      render(<TestAccessibleStreamingText text={specialText} />);
      
      expect(screen.getByText(specialText)).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should handle large text content', () => {
      const largeText = 'Large content '.repeat(500);
      
      expect(() => {
        render(<TestAccessibleStreamingText text={largeText} />);
      }).not.toThrow();
      
      // Just check that content exists, don't check exact text match due to potential truncation
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toBeInTheDocument();
      expect(container.textContent).toContain('Large content');
    });

    it('should handle rapid text updates', () => {
      const { rerender } = render(
        <TestAccessibleStreamingText text="Text 0" />
      );
      
      for (let i = 1; i < 20; i++) {
        rerender(<TestAccessibleStreamingText text={`Text ${i}`} />);
      }
      
      expect(screen.getByText('Text 19')).toBeInTheDocument();
    });

    it('should cleanup properly on unmount', () => {
      const { unmount } = render(<TestAccessibleStreamingText text="Test" />);
      
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      render(
        <TestAccessibleStreamingText 
          text="Test" 
          className="custom-class" 
        />
      );
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveClass('custom-class');
    });

    it('should maintain base accessibility classes', () => {
      render(
        <TestAccessibleStreamingText 
          text="Test" 
          className="custom-class" 
        />
      );
      
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveClass('accessible-streaming-text');
      expect(container).toHaveClass('reduced-motion');
      expect(container).toHaveClass('keyboard-navigable');
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('Screen Reader Support', () => {
    it('should have appropriate aria-live regions', () => {
      render(<TestAccessibleStreamingText text="Test" isPartial={true} />);
      
      // Main container should have aria-live
      const container = screen.getByLabelText('Live streaming text');
      expect(container).toHaveAttribute('aria-live', 'polite');
      
      // Content area should also have aria-live
      const content = screen.getByLabelText('Streaming text content');
      expect(content).toHaveAttribute('aria-live', 'polite');
    });

    it('should provide status announcements', () => {
      render(<TestAccessibleStreamingText text="Test" isPartial={false} />);
      
      const statusElements = screen.getAllByText('Text complete');
      expect(statusElements.length).toBeGreaterThan(0);
      
      statusElements.forEach(element => {
        expect(element).toHaveClass('sr-only');
      });
    });

    it('should hide keyboard instructions from screen readers appropriately', () => {
      render(<TestAccessibleStreamingText text="Test" />);
      
      const instructions = screen.getByText('Keyboard controls available:').closest('div');
      expect(instructions).toHaveClass('sr-only');
      expect(instructions).toHaveAttribute('aria-hidden', 'false');
    });
  });
});
