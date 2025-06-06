import React, { useState, useEffect } from 'react';
import { cn } from '@/utils/tailwind';
import { useSharedState } from '../hooks/useSharedState';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { WindowButton } from './ui/window-button';
import { FocusManager } from './FocusManager';

export const ShortcutsHelp: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { onMessage } = useSharedState();
  const { shortcuts } = useKeyboardShortcuts();

  // Listen for help command
  useEffect(() => {
    const removeListener = onMessage((channel: string) => {
      if (channel === 'show-shortcuts-help') {
        setIsVisible(true);
      }
    });

    return removeListener;
  }, [onMessage]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isVisible) {
        setIsVisible(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const formatShortcut = (shortcut: any) => {
    const modifiers = shortcut.modifiers || [];
    const parts = [...modifiers, shortcut.key];
    return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' + ');
  };

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.global ? 'Global' : 
                   shortcut.windowTypes?.[0] || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, any[]>);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <FocusManager autoFocus trapFocus restoreFocus>
        <div className="bg-background border rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
            <WindowButton
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsVisible(false)}
              aria-label="Close shortcuts help"
            >
              ✕
            </WindowButton>
          </div>

          {/* Content */}
          <div className="p-4 space-y-6 overflow-y-auto max-h-[60vh]">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex items-center space-x-1">
                        {formatShortcut(shortcut).split(' + ').map((key, keyIndex, array) => (
                          <React.Fragment key={keyIndex}>
                            <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
                              {key}
                            </kbd>
                            {keyIndex < array.length - 1 && (
                              <span className="text-muted-foreground">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Additional tips */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Tips
              </h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Use Tab to navigate between focusable elements</p>
                <p>• Press Enter or Space to activate buttons</p>
                <p>• Use arrow keys to navigate menus and lists</p>
                <p>• Escape closes dialogs and overlays</p>
                <p>• Ctrl+Shift+H shows this help dialog</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Press <kbd className="px-1 py-0.5 bg-background rounded border text-xs">Esc</kbd> to close
            </div>
            <WindowButton
              variant="default"
              size="sm"
              onClick={() => setIsVisible(false)}
              autoFocus
            >
              Close
            </WindowButton>
          </div>
        </div>
      </FocusManager>
    </div>
  );
};