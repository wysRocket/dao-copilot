import React, { useState, useEffect } from 'react';
import AccessibleStreamingText from './AccessibleStreamingText';
import { useAccessibility } from '../hooks/useAccessibility';
import GlassBox from './GlassBox';
import { cn } from '../utils/tailwind';

/**
 * Accessibility testing demo for streaming text components
 * This component demonstrates various accessibility features and allows testing
 */
export const AccessibilityDemo: React.FC = () => {
  const [demoText, setDemoText] = useState('');
  const [isPartial, setIsPartial] = useState(true);
  const [mode, setMode] = useState<'character' | 'word' | 'instant'>('character');
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Accessibility hook for demo controls
  const accessibility = useAccessibility({
    autoDetect: true,
    enableKeyboardHandling: true,
    enableFocusManagement: true,
  });

  // Sample text for demonstration
  const sampleTexts = [
    "Hello, this is a demonstration of accessible streaming text.",
    "The quick brown fox jumps over the lazy dog.",
    "Accessibility features include screen reader support, keyboard navigation, and reduced motion preferences.",
    "This text demonstrates corrections and real-time updates.",
    "Press space to pause, R to restart, or Enter to skip to the end."
  ];

  // Demo state
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const fullText = sampleTexts[currentTextIndex];

  // Simulate streaming text
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      if (currentIndex < fullText.length) {
        setDemoText(fullText.slice(0, currentIndex + 1));
        setCurrentIndex(prev => prev + 1);
        setIsPartial(true);
      } else {
        setIsPartial(false);
        setIsRunning(false);
        // Move to next text after a delay
        setTimeout(() => {
          setCurrentTextIndex(prev => (prev + 1) % sampleTexts.length);
          setCurrentIndex(0);
          setDemoText('');
        }, 2000);
      }
    }, mode === 'character' ? 50 : mode === 'word' ? 200 : 10);

    return () => clearInterval(timer);
  }, [isRunning, currentIndex, fullText, mode]);

  // Control handlers
  const startDemo = () => {
    setIsRunning(true);
    accessibility.announce('Demo started', 'medium');
  };

  const pauseDemo = () => {
    setIsRunning(false);
    accessibility.announce('Demo paused', 'medium');
  };

  const resetDemo = () => {
    setIsRunning(false);
    setCurrentIndex(0);
    setDemoText('');
    setIsPartial(true);
    accessibility.announce('Demo reset', 'medium');
  };

  const skipToEnd = () => {
    setDemoText(fullText);
    setIsPartial(false);
    setIsRunning(false);
    accessibility.announce('Skipped to end', 'medium');
  };

  // Keyboard shortcuts
  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case ' ':
        event.preventDefault();
        if (isRunning) {
          pauseDemo();
        } else {
          startDemo();
        }
        break;
      case 'r':
      case 'R':
        event.preventDefault();
        resetDemo();
        break;
      case 'Enter':
        event.preventDefault();
        skipToEnd();
        break;
      case 'Escape':
        event.preventDefault();
        pauseDemo();
        break;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Accessibility Demo
        </h1>
        <p className="text-sm text-gray-600" style={{ color: 'var(--text-secondary)' }}>
          Testing streaming text accessibility features
        </p>
      </div>

      {/* Accessibility Status Panel */}
      <GlassBox variant="light" className="p-4">
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Accessibility Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium">Screen Reader:</span>
            <br />
            <span className={cn(
              accessibility.isScreenReaderActive ? 'text-green-600' : 'text-gray-500'
            )}>
              {accessibility.isScreenReaderActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <span className="font-medium">Reduced Motion:</span>
            <br />
            <span className={cn(
              accessibility.shouldReduceMotion ? 'text-blue-600' : 'text-gray-500'
            )}>
              {accessibility.shouldReduceMotion ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">High Contrast:</span>
            <br />
            <span className={cn(
              accessibility.shouldUseHighContrast ? 'text-purple-600' : 'text-gray-500'
            )}>
              {accessibility.shouldUseHighContrast ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">Keyboard Nav:</span>
            <br />
            <span className="text-green-600">Enabled</span>
          </div>
        </div>
      </GlassBox>

      {/* Controls */}
      <GlassBox variant="medium" className="p-4">
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Demo Controls
        </h2>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={startDemo}
            disabled={isRunning}
            className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Start streaming demo"
          >
            Start
          </button>
          <button
            onClick={pauseDemo}
            disabled={!isRunning}
            className="px-4 py-2 bg-yellow-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            aria-label="Pause streaming demo"
          >
            Pause
          </button>
          <button
            onClick={resetDemo}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Reset demo to beginning"
          >
            Reset
          </button>
          <button
            onClick={skipToEnd}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Skip to end of current text"
          >
            Skip to End
          </button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span>Mode:</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'character' | 'word' | 'instant')}
              className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Select streaming mode"
            >
              <option value="character">Character</option>
              <option value="word">Word</option>
              <option value="instant">Instant</option>
            </select>
          </label>
        </div>

        <div className="text-sm text-gray-600 space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <p><strong>Keyboard Shortcuts:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Space</kbd> - Start/Pause</li>
            <li><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">R</kbd> - Reset</li>
            <li><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Enter</kbd> - Skip to End</li>
            <li><kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Escape</kbd> - Pause</li>
          </ul>
        </div>
      </GlassBox>

      {/* Demo Area */}
      <div onKeyDown={handleKeyDown} tabIndex={0} className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg">
        <GlassBox variant="heavy" className="p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Streaming Text Demo
          </h2>
          
          <div className="min-h-[100px] p-4 border-2 border-dashed border-gray-300 rounded-lg">
            {demoText ? (
              <AccessibleStreamingText
                text={demoText}
                isPartial={isPartial}
                mode={mode}
                announceChanges={true}
                announcementPriority="medium"
                enableKeyboardControls={true}
                verboseStatus={true}
                ariaLabel="Demo streaming text content"
                ariaDescription="This is a demonstration of accessible streaming text with keyboard controls and screen reader support"
                className="text-lg leading-relaxed"
              />
            ) : (
              <div className="flex items-center justify-center h-20 text-gray-500">
                <p>Press Start to begin the accessibility demo</p>
              </div>
            )}
          </div>
        </GlassBox>
      </div>

      {/* Instructions */}
      <GlassBox variant="light" className="p-4">
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Testing Instructions
        </h2>
        <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <div>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Screen Reader Testing:</h3>
            <p>Use NVDA, JAWS, or VoiceOver to test announcements. Text changes should be announced as they occur.</p>
          </div>
          <div>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Keyboard Testing:</h3>
            <p>Tab to focus on controls and the demo area. Use keyboard shortcuts to control playback.</p>
          </div>
          <div>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Motion Preferences:</h3>
            <p>Try changing your system&apos;s motion preferences to see animations adapt automatically.</p>
          </div>
          <div>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>High Contrast:</h3>
            <p>Enable high contrast mode or Windows High Contrast to test color adaptation.</p>
          </div>
        </div>
      </GlassBox>
    </div>
  );
};

export default AccessibilityDemo;
