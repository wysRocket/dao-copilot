import React from 'react'
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts'

export const ShortcutDebugger: React.FC = () => {
  const {shortcuts} = useKeyboardShortcuts()

  return (
    <div className="bg-card fixed right-4 bottom-4 z-50 max-w-md rounded-lg border p-4 shadow-lg">
      <h3 className="text-foreground mb-2 text-sm font-semibold">Active Keyboard Shortcuts:</h3>
      <div className="space-y-1 text-xs">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="text-foreground flex justify-between">
            <span>{shortcut.description}</span>
            <span className="text-muted-foreground font-mono">
              {shortcut.modifiers
                ?.map(mod =>
                  mod === 'meta'
                    ? '⌘'
                    : mod === 'ctrl'
                      ? 'Ctrl'
                      : mod === 'shift'
                        ? 'Shift'
                        : mod === 'alt'
                          ? 'Alt'
                          : mod
                )
                .join('+') || ''}
              {shortcut.modifiers?.length ? '+' : ''}
              {shortcut.key}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Open browser console to see keydown events
      </p>
    </div>
  )
}
