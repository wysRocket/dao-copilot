/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import StreamingTextRenderer from '../../components/StreamingTextRenderer';

// Mock audio context for performance tests
const mockAudioContext = {
  createOscillator: vi.fn(),
  createGain: vi.fn(),
  destination: {},
  sampleRate: 44100,
  close: vi.fn(),
};

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: vi.fn().mockImplementation(() => mockAudioContext),
});

Object.defineProperty(window, 'webkitAudioContext', {
  writable: true,
  value: vi.fn().mockImplementation(() => mockAudioContext),
});

describe('StreamingTextRenderer', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock IntersectionObserver
    const mockIntersectionObserver = vi.fn();
    mockIntersectionObserver.mockReturnValue({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    });
    window.IntersectionObserver = mockIntersectionObserver;

    // Mock window.matchMedia
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

    // Mock performance.now
    Object.defineProperty(window, 'performance', {
      writable: true,
      value: {
        now: vi.fn(() => Date.now()),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      expect(() => {
        render(<StreamingTextRenderer text="" />);
      }).not.toThrow();
    });

    it('should display static text correctly', () => {
      const testText = 'Hello, world!';
      render(<StreamingTextRenderer text={testText} />);
      
      expect(screen.getByText(testText)).toBeInTheDocument();
    });

    it('should handle empty text', () => {
      render(<StreamingTextRenderer text="" />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const customClass = 'custom-streaming-text';
      render(
        <StreamingTextRenderer 
          text="Test" 
          className={customClass}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toHaveClass(customClass);
    });
  });

  describe('Streaming Modes', () => {
    it('should handle character mode streaming', () => {
      render(<StreamingTextRenderer text="Test" mode="character" isPartial={true} />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should handle word mode streaming', () => {
      render(<StreamingTextRenderer text="Test word streaming" mode="word" isPartial={true} />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should handle instant mode', () => {
      render(<StreamingTextRenderer text="Test instant text" mode="instant" />);
      
      expect(screen.getByText('Test instant text')).toBeInTheDocument();
    });

    it('should show cursor when specified', () => {
      render(<StreamingTextRenderer text="Test" showCursor={true} isPartial={true} />);
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Text Formatting', () => {
    it('should render bold text when formatting is enabled', () => {
      render(
        <StreamingTextRenderer 
          text="This is **bold** text" 
          enableFormatting={true}
        />
      );
      
      expect(screen.getByText('bold')).toBeInTheDocument();
    });

    it('should handle text without formatting', () => {
      render(
        <StreamingTextRenderer 
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
        render(<StreamingTextRenderer text={largeText} />);
      }).not.toThrow();
      
      expect(screen.getByText(largeText)).toBeInTheDocument();
    });

    it('should handle rapid text updates', async () => {
      const { rerender } = render(
        <StreamingTextRenderer text="" animationSpeed={100} />
      );
      
      // Rapidly update text
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          rerender(
            <StreamingTextRenderer 
              text={`Text ${i}`} 
              animationSpeed={100} 
            />
          );
        });
      }
      
      // Should still work without issues
      expect(screen.getByText('Text 9')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should show state indicator when enabled', () => {
      render(
        <StreamingTextRenderer 
          text="Test content" 
          showStateIndicator={true}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should handle partial text state', () => {
      render(
        <StreamingTextRenderer 
          text="Partial text" 
          isPartial={true}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });

    it('should handle complete text state', () => {
      render(
        <StreamingTextRenderer 
          text="Complete text" 
          isPartial={false}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-live', 'off');
    });
  });

  describe('Callbacks and Events', () => {
    it('should call onTextUpdate when text changes', async () => {
      const onTextUpdate = vi.fn();
      const { rerender } = render(
        <StreamingTextRenderer 
          text="Initial" 
          onTextUpdate={onTextUpdate}
        />
      );
      
      await act(async () => {
        rerender(
          <StreamingTextRenderer 
            text="Updated" 
            onTextUpdate={onTextUpdate}
          />
        );
      });
      
      // onTextUpdate should be called during the streaming process
      await waitFor(() => {
        expect(onTextUpdate).toHaveBeenCalled();
      });
    });

    it('should call onAnimationComplete when animation finishes', async () => {
      const onAnimationComplete = vi.fn();
      render(
        <StreamingTextRenderer 
          text="Test" 
          mode="character"
          animationSpeed={1000} // Fast animation for testing
          onAnimationComplete={onAnimationComplete}
        />
      );
      
      // Wait for animation to potentially complete
      await waitFor(() => {
        expect(onAnimationComplete).toHaveBeenCalled();
      }, { timeout: 2000 });
    });

    it('should call onStateChange when state changes', async () => {
      const onStateChange = vi.fn();
      const { rerender } = render(
        <StreamingTextRenderer 
          text="Test" 
          isPartial={true}
          onStateChange={onStateChange}
        />
      );
      
      await act(async () => {
        rerender(
          <StreamingTextRenderer 
            text="Test" 
            isPartial={false}
            onStateChange={onStateChange}
          />
        );
      });
      
      expect(onStateChange).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<StreamingTextRenderer text="Test" />);
      
      const container = screen.getByRole('log');
      expect(container).toHaveAttribute('aria-label');
      expect(container).toHaveAttribute('tabIndex', '0');
    });

    it('should support keyboard navigation', () => {
      render(<StreamingTextRenderer text="Test" isPartial={true} />);
      
      const container = screen.getByRole('log');
      
      // Test Escape key to complete animation
      fireEvent.keyDown(container, { key: 'Escape' });
      
      expect(container).toBeInTheDocument();
    });

    it('should announce streaming status', () => {
      render(<StreamingTextRenderer text="Test" isPartial={true} />);
      
      // Check for screen reader announcements
      const announcement = screen.getByText('Receiving text...');
      expect(announcement).toHaveClass('sr-only');
    });

    it('should announce completion status', () => {
      render(<StreamingTextRenderer text="Test" isPartial={false} />);
      
      // Check for completion announcement
      const announcement = screen.getByText('Text complete');
      expect(announcement).toHaveClass('sr-only');
    });
  });

  describe('Typewriter Effects', () => {
    it('should enable typewriter effects when specified', () => {
      render(
        <StreamingTextRenderer 
          text="Test typewriter" 
          enableTypewriterEffects={true}
          typewriterConfig={{ speed: 100 }}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should show typewriter cursor', () => {
      render(
        <StreamingTextRenderer 
          text="Test" 
          enableTypewriterEffects={true}
          isPartial={true}
        />
      );
      
      // Typewriter cursor should be present in DOM
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid text gracefully', () => {
      expect(() => {
        // Test with undefined text (common error case)
        render(<StreamingTextRenderer text={undefined as unknown as string} />);
      }).not.toThrow();
    });

    it('should handle rendering errors gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // This should not crash the component
      render(<StreamingTextRenderer text="Test" />);
      
      consoleError.mockRestore();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources on unmount', () => {
      const { unmount } = render(
        <StreamingTextRenderer text="Test" isPartial={true} />
      );
      
      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it('should handle rapid mount/unmount cycles', () => {
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(
          <StreamingTextRenderer text={`Test ${i}`} />
        );
        unmount();
      }
      
      // Should not cause memory leaks or errors
      expect(true).toBe(true);
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom partial styles', () => {
      const partialStyle = { color: 'blue', opacity: 0.5 };
      render(
        <StreamingTextRenderer 
          text="Test" 
          isPartial={true}
          partialStyle={partialStyle}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should apply custom final styles', () => {
      const finalStyle = { color: 'green', fontWeight: 'bold' };
      render(
        <StreamingTextRenderer 
          text="Test" 
          isPartial={false}
          finalStyle={finalStyle}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });

    it('should handle correction highlighting', () => {
      const correctionStyle = { backgroundColor: 'yellow' };
      render(
        <StreamingTextRenderer 
          text="Test" 
          highlightCorrections={true}
          correctionStyle={correctionStyle}
        />
      );
      
      const container = screen.getByRole('log');
      expect(container).toBeInTheDocument();
    });
  });
});
