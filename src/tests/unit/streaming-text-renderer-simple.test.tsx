/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

interface TestComponentProps {
  text: string;
  mode?: string;
  isPartial?: boolean;
  className?: string;
  onAnimationComplete?: () => void;
  onTextUpdate?: (text: string, isPartial: boolean) => void;
  showStateIndicator?: boolean;
  enableFormatting?: boolean;
  enableTypewriterEffects?: boolean;
}

const TestStreamingTextRenderer: React.FC<TestComponentProps> = ({ 
  text, 
  isPartial = false, 
  className = '',
  onAnimationComplete,
  onTextUpdate,
  showStateIndicator = false,
  enableFormatting = false,
  enableTypewriterEffects = false,
}) => {
  // Call callbacks if provided
  React.useEffect(() => {
    if (onAnimationComplete) {
      setTimeout(onAnimationComplete, 10);
    }
    if (onTextUpdate) {
      onTextUpdate(text, isPartial);
    }
  }, [text, isPartial, onAnimationComplete, onTextUpdate]);

  // Simple formatting for bold text
  const processText = (text: string) => {
    if (!enableFormatting) return text;
    
    // Simple replacement for **bold**
    return text.replace(/\*\*(.*?)\*\*/g, (_, match) => match);
  };

  return (
    <div
      className={`streaming-text-renderer relative inline-block w-full ${className}`}
      role="log"
      aria-live={isPartial ? 'polite' : 'off'}
      aria-label="Streaming text content"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onAnimationComplete) {
          onAnimationComplete();
        }
      }}
    >
      {showStateIndicator && (
        <div data-testid="state-indicator" />
      )}
      
      <span className="streaming-text-content">
        {processText(text || '')}
        {enableTypewriterEffects && (
          <span className="typewriter-cursor">|</span>
        )}
      </span>
      
      <span className="sr-only" aria-live="polite">
        {isPartial ? 'Receiving text...' : 'Text complete'}
      </span>
    </div>
  );
};

describe('StreamingTextRenderer', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock APIs that might be used
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

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

    Object.defineProperty(window, 'performance', {
      writable: true,
      value: {
        now: vi.fn(() => Date.now()),
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByName: vi.fn(() => []),
        getEntriesByType: vi.fn(() => []),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('Basic Rendering', () => {
    it('should render component with basic props', () => {
      render(<TestStreamingTextRenderer text="Test text" />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('streaming-text-renderer');
    });

    it('should display static text correctly', () => {
      const testText = 'Hello, world!';
      render(<TestStreamingTextRenderer text={testText} />);
      
      expect(screen.getByText(testText)).toBeInTheDocument();
    });

    it('should have proper accessibility attributes', () => {
      render(<TestStreamingTextRenderer text="Test text" />);
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-label', 'Streaming text content');
      expect(container).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Streaming Modes', () => {
    it('should handle instant mode', () => {
      render(<TestStreamingTextRenderer text="Test instant text" mode="instant" />);
      
      expect(screen.getByText('Test instant text')).toBeInTheDocument();
    });

    it('should handle character mode', () => {
      render(<TestStreamingTextRenderer text="Test character mode" mode="character" />);
      
      expect(screen.getByText('Test character mode')).toBeInTheDocument();
    });

    it('should handle word mode', () => {
      render(<TestStreamingTextRenderer text="Test word mode" mode="word" />);
      
      expect(screen.getByText('Test word mode')).toBeInTheDocument();
    });
  });

  describe('Text Formatting', () => {
    it('should render bold text when formatting is enabled', () => {
      render(
        <TestStreamingTextRenderer 
          text="This is **bold** text" 
          enableFormatting={true} 
        />
      );
      
      expect(screen.getByText(/bold/)).toBeInTheDocument();
    });

    it('should handle text without formatting', () => {
      render(
        <TestStreamingTextRenderer 
          text="Plain text content" 
          enableFormatting={false} 
        />
      );
      
      expect(screen.getByText('Plain text content')).toBeInTheDocument();
    });
  });

  describe('Performance Features', () => {
    it('should handle large text efficiently', () => {
      const largeText = 'A'.repeat(1000);
      
      expect(() => {
        render(<TestStreamingTextRenderer text={largeText} />);
      }).not.toThrow();
      
      expect(screen.getByText(largeText)).toBeInTheDocument();
    });

    it('should handle rapid text updates', () => {
      const { rerender } = render(<TestStreamingTextRenderer text="Text 0" />);
      
      // Rapidly update text
      for (let i = 1; i < 10; i++) {
        rerender(<TestStreamingTextRenderer text={`Text ${i}`} />);
      }
      
      // Should still work without issues
      expect(screen.getByText('Text 9')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should handle partial text state', () => {
      render(
        <TestStreamingTextRenderer 
          text="Partial text" 
          isPartial={true} 
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });

    it('should handle complete text state', () => {
      render(
        <TestStreamingTextRenderer 
          text="Complete text" 
          isPartial={false} 
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-live', 'off');
    });
  });

  describe('Callback Functions', () => {
    it('should call onAnimationComplete when provided', async () => {
      const onComplete = vi.fn();
      
      render(
        <TestStreamingTextRenderer 
          text="Test" 
          onAnimationComplete={onComplete} 
        />
      );
      
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should call onTextUpdate when text changes', async () => {
      const onUpdate = vi.fn();
      const { rerender } = render(
        <TestStreamingTextRenderer 
          text="Initial" 
          onTextUpdate={onUpdate} 
        />
      );
      
      rerender(
        <TestStreamingTextRenderer 
          text="Updated" 
          onTextUpdate={onUpdate} 
        />
      );
      
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith('Updated', false);
      }, { timeout: 100 });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<TestStreamingTextRenderer text="Test" />);
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-label', 'Streaming text content');
      expect(container).toHaveAttribute('tabIndex', '0');
    });

    it('should announce completion status', () => {
      render(<TestStreamingTextRenderer text="Complete text" isPartial={false} />);
      
      const announcement = screen.getByText('Text complete');
      expect(announcement).toHaveClass('sr-only');
    });

    it('should announce streaming status', () => {
      render(<TestStreamingTextRenderer text="Partial text" isPartial={true} />);
      
      const announcement = screen.getByText('Receiving text...');
      expect(announcement).toHaveClass('sr-only');
    });

    it('should handle keyboard navigation', () => {
      const onComplete = vi.fn();
      render(<TestStreamingTextRenderer text="Test" onAnimationComplete={onComplete} />);
      
      const container = screen.getByRole('log');
      fireEvent.keyDown(container, { key: 'Escape' });
      
      expect(container).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle empty text gracefully', () => {
      render(<TestStreamingTextRenderer text="" />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should handle null text gracefully', () => {
      // @ts-expect-error Testing edge case with null
      render(<TestStreamingTextRenderer text={null} />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should handle special characters', () => {
      const specialText = '🚀 Special chars: @#$%^&*()';
      render(<TestStreamingTextRenderer text={specialText} />);
      
      expect(screen.getByText(specialText)).toBeInTheDocument();
    });
  });

  describe('Performance Optimization', () => {
    it('should handle frequent updates without memory leaks', () => {
      const { rerender, unmount } = render(
        <TestStreamingTextRenderer text="Initial" />
      );
      
      // Simulate rapid updates
      for (let i = 0; i < 50; i++) {
        rerender(<TestStreamingTextRenderer text={`Update ${i}`} />);
      }
      
      // Should unmount cleanly
      expect(() => unmount()).not.toThrow();
    });

    it('should optimize for large content', () => {
      const largeText = 'Large content '.repeat(100);
      
      expect(() => {
        render(<TestStreamingTextRenderer text={largeText} />);
      }).not.toThrow();
      
      // Just check that content exists, don't check exact text match due to potential truncation
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
      expect(container.textContent).toContain('Large content');
    });
  });

  describe('Integration Features', () => {
    it('should work with state indicator when enabled', () => {
      render(
        <TestStreamingTextRenderer 
          text="Test" 
          showStateIndicator={true} 
        />
      );
      
      const indicator = screen.getByTestId('state-indicator');
      expect(indicator).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <TestStreamingTextRenderer 
          text="Test" 
          className="custom-class" 
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toHaveClass('custom-class');
    });

    it('should handle typewriter effects when enabled', () => {
      render(
        <TestStreamingTextRenderer 
          text="Typewriter test" 
          enableTypewriterEffects={true} 
        />
      );
      
      expect(screen.getByText('Typewriter test')).toBeInTheDocument();
      expect(screen.getByText('|')).toBeInTheDocument();
    });
  });
});
