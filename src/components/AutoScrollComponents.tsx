import React from 'react';
import { useAutoScroll } from '../hooks/useAutoScroll';
import '../styles/auto-scroll-components.css';

/**
 * Props for NewContentIndicator component
 */
export interface NewContentIndicatorProps {
  /** Whether the indicator is visible */
  visible: boolean;
  /** Number of new messages/content items */
  newContentCount?: number;
  /** Custom message to display */
  message?: string;
  /** Callback when indicator is clicked */
  onClick: () => void;
  /** Position variant */
  variant?: 'bottom' | 'floating';
  /** Animation style */
  animation?: 'slide' | 'fade' | 'bounce';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays an indicator when new content is available below the current view
 */
export const NewContentIndicator: React.FC<NewContentIndicatorProps> = ({
  visible,
  newContentCount,
  message,
  onClick,
  variant = 'bottom',
  animation = 'slide',
  className = '',
}) => {
  if (!visible) return null;

  const getDisplayMessage = () => {
    if (message) return message;
    if (newContentCount && newContentCount > 0) {
      return newContentCount === 1 
        ? '1 new message' 
        : `${newContentCount} new messages`;
    }
    return 'New content available';
  };

  const getIcon = () => {
    return (
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 16 16" 
        fill="currentColor"
        className="new-content-icon"
      >
        <path d="M8 12l-4-4h8l-4 4z" />
      </svg>
    );
  };

  return (
    <div
      className={`
        new-content-indicator
        new-content-indicator--${variant}
        new-content-indicator--${animation}
        ${visible ? 'new-content-indicator--visible' : ''}
        ${className}
      `.trim()}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${getDisplayMessage()}. Click to scroll to bottom.`}
    >
      <div className="new-content-indicator__content">
        <span className="new-content-indicator__message">
          {getDisplayMessage()}
        </span>
        {getIcon()}
      </div>
    </div>
  );
};

/**
 * Props for ScrollControls component
 */
export interface ScrollControlsProps {
  /** Whether auto-scroll is enabled */
  isAutoScrolling: boolean;
  /** Whether there's new content below */
  hasNewContent: boolean;
  /** Current scroll percentage (0-100) */
  scrollPercentage: number;
  /** Whether the container is scrollable */
  isScrollable: boolean;
  /** Callback to toggle auto-scroll */
  onToggleAutoScroll: () => void;
  /** Callback to scroll to top */
  onScrollToTop: () => void;
  /** Callback to scroll to bottom */
  onScrollToBottom: () => void;
  /** Whether controls are visible */
  visible?: boolean;
  /** Position of controls */
  position?: 'top-right' | 'bottom-right' | 'floating';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Provides manual scroll controls for the transcript container
 */
export const ScrollControls: React.FC<ScrollControlsProps> = ({
  isAutoScrolling,
  hasNewContent,
  scrollPercentage,
  isScrollable,
  onToggleAutoScroll,
  onScrollToTop,
  onScrollToBottom,
  visible = true,
  position = 'floating',
  className = '',
}) => {
  if (!visible || !isScrollable) return null;

  const formatPercentage = () => {
    return `${Math.round(scrollPercentage)}%`;
  };

  return (
    <div
      className={`
        scroll-controls
        scroll-controls--${position}
        ${className}
      `.trim()}
      role="group"
      aria-label="Scroll controls"
    >
      {/* Scroll percentage indicator */}
      <div className="scroll-controls__indicator">
        <span className="scroll-controls__percentage">
          {formatPercentage()}
        </span>
      </div>

      {/* Auto-scroll toggle */}
      <button
        className={`
          scroll-controls__button
          scroll-controls__auto-scroll
          ${isAutoScrolling ? 'scroll-controls__button--active' : ''}
        `.trim()}
        onClick={onToggleAutoScroll}
        title={isAutoScrolling ? 'Disable auto-scroll' : 'Enable auto-scroll'}
        aria-label={isAutoScrolling ? 'Disable auto-scroll' : 'Enable auto-scroll'}
        aria-pressed={isAutoScrolling}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          {isAutoScrolling ? (
            // Pause icon
            <path d="M5 3h2v10H5V3zm4 0h2v10H9V3z" />
          ) : (
            // Play icon
            <path d="M5 3l8 5-8 5V3z" />
          )}
        </svg>
      </button>

      {/* Scroll to top */}
      <button
        className="scroll-controls__button scroll-controls__top"
        onClick={onScrollToTop}
        title="Scroll to top"
        aria-label="Scroll to top"
        disabled={scrollPercentage === 0}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4l-4 4h8l-4-4z" />
        </svg>
      </button>

      {/* Scroll to bottom */}
      <button
        className={`
          scroll-controls__button 
          scroll-controls__bottom
          ${hasNewContent ? 'scroll-controls__button--highlight' : ''}
        `.trim()}
        onClick={onScrollToBottom}
        title="Scroll to bottom"
        aria-label="Scroll to bottom"
        disabled={scrollPercentage === 100}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 12l-4-4h8l-4 4z" />
        </svg>
        {hasNewContent && (
          <div className="scroll-controls__notification-dot" />
        )}
      </button>
    </div>
  );
};

/**
 * Props for AutoScrollContainer component
 */
export interface AutoScrollContainerProps {
  /** Child content to render */
  children: React.ReactNode;
  /** Auto-scroll configuration */
  config?: {
    enabled?: boolean;
    showControls?: boolean;
    showNewContentIndicator?: boolean;
    bottomThreshold?: number;
    smooth?: boolean;
  };
  /** Custom styling */
  style?: React.CSSProperties;
  /** Additional CSS classes */
  className?: string;
  /** Callback when scroll state changes */
  onScrollStateChange?: (state: {
    isAutoScrolling: boolean;
    hasNewContent: boolean;
    scrollPercentage: number;
  }) => void;
  /** Callback when new content is added (call this when content changes) */
  onNewContent?: () => void;
}

/**
 * All-in-one auto-scroll container with built-in controls and indicators
 */
export const AutoScrollContainer: React.FC<AutoScrollContainerProps> = ({
  children,
  config = {},
  style,
  className = '',
  onScrollStateChange,
  onNewContent: externalOnNewContent,
}) => {
  const {
    enabled = true,
    showControls = true,
    showNewContentIndicator = true,
    ...autoScrollConfig
  } = config;

  const {
    state,
    controls,
    containerRef,
    onNewContent: internalOnNewContent,
  } = useAutoScroll({
    enabled,
    ...autoScrollConfig,
  });

  // Expose new content callback
  React.useEffect(() => {
    if (externalOnNewContent) {
      externalOnNewContent = internalOnNewContent;
    }
  }, [externalOnNewContent, internalOnNewContent]);

  // Notify parent of scroll state changes
  React.useEffect(() => {
    if (onScrollStateChange) {
      onScrollStateChange({
        isAutoScrolling: state.isAutoScrolling,
        hasNewContent: state.hasNewContent,
        scrollPercentage: state.scrollPercentage,
      });
    }
  }, [state.isAutoScrolling, state.hasNewContent, state.scrollPercentage, onScrollStateChange]);

  return (
    <div className={`auto-scroll-container ${className}`} style={style}>
      {/* Main scrollable content */}
      <div
        ref={containerRef}
        className="auto-scroll-container__content"
      >
        {children}
      </div>

      {/* New content indicator */}
      {showNewContentIndicator && (
        <NewContentIndicator
          visible={state.hasNewContent}
          onClick={controls.scrollToBottom}
          variant="floating"
          animation="bounce"
        />
      )}

      {/* Scroll controls */}
      {showControls && (
        <ScrollControls
          isAutoScrolling={state.isAutoScrolling}
          hasNewContent={state.hasNewContent}
          scrollPercentage={state.scrollPercentage}
          isScrollable={state.isScrollable}
          onToggleAutoScroll={controls.toggleAutoScroll}
          onScrollToTop={controls.scrollToTop}
          onScrollToBottom={controls.scrollToBottom}
          position="floating"
        />
      )}
    </div>
  );
};

export default AutoScrollContainer;
