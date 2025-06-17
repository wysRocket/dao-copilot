import React from 'react'
import {useKeyboardShortcuts} from '../hooks/useKeyboardShortcuts'

export const ShortcutDebugger: React.FC = () => {
  const {shortcuts} = useKeyboardShortcuts()

  return (
    <div className="fixed right-4 bottom-4 z-50 max-w-md rounded-lg border bg-card p-4 shadow-lg">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Active Keyboard Shortcuts:</h3>
      <div className="space-y-1 text-xs">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="flex justify-between text-foreground">
            <span>{shortcut.description}</span>
            <span className="font-mono text-muted-foreground">
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
      <p className="mt-2 text-xs text-muted-foreground">Open browser console to see keydown events</p>
    </div>
  )
}
