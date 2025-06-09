import {useEffect, useCallback} from 'react';
import {usePortalManager} from '../components/portals/PortalManager';
import {useWindowState} from '../contexts/WindowStateProvider';
import {useSharedState} from './useSharedState';

export interface KeyboardShortcut {
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  action: () => void;
  description: string;
  global?: boolean; // Works across all windows
  windowTypes?: string[]; // Only works in specific window types
}

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[] = []) => {
  const portalManager = usePortalManager();
  const {windowState} = useWindowState();
  const {broadcast} = useSharedState();

  // Default global shortcuts
  const defaultShortcuts: KeyboardShortcut[] = [
    {
      key: '1',
      modifiers: ['ctrl', 'shift'],
      action: () => portalManager.focusWindow('main'),
      description: 'Focus main window',
      global: true,
    },
    {
      key: '2',
      modifiers: ['ctrl', 'shift'],
      action: async () => {
        const assistantWindows = portalManager.allWindows.filter(
          (w) => w.type === 'assistant',
        );
        if (assistantWindows.length > 0) {
          portalManager.focusWindow(assistantWindows[0].windowId);
        } else {
          await portalManager.createWindow('assistant');
        }
      },
      description: 'Focus or create assistant window',
      global: true,
    },
    {
      key: '3',
      modifiers: ['ctrl', 'shift'],
      action: async () => {
        const assistantWindows = portalManager.allWindows.filter(
          (w) => w.type === 'assistant',
        );
        if (assistantWindows.length > 0) {
          portalManager.focusWindow(assistantWindows[0].windowId);
          // TODO: Navigate to Settings tab in assistant window
        } else {
          await portalManager.createWindow('assistant');
          // TODO: Navigate to Settings tab when assistant opens
        }
      },
      description: 'Focus or create assistant window (Settings tab)',
      global: true,
    },
    {
      key: '4',
      modifiers: ['ctrl', 'shift'],
      action: async () => {
        const assistantWindows = portalManager.allWindows.filter(
          (w) => w.type === 'assistant',
        );
        if (assistantWindows.length > 0) {
          if (assistantWindows[0].isVisible) {
            portalManager.hideWindow(assistantWindows[0].windowId);
          } else {
            portalManager.showWindow(assistantWindows[0].windowId);
          }
        } else {
          await portalManager.createWindow('assistant');
        }
      },
      description: 'Toggle assistant window',
      global: true,
    },
    {
      key: 'w',
      modifiers: ['ctrl'],
      action: () => {
        if (windowState.windowType !== 'main') {
          window.electronWindow?.close();
        }
      },
      description: 'Close current window (except main)',
      global: true,
    },
    {
      key: 'r',
      modifiers: ['ctrl', 'shift'],
      action: () => broadcast('sync-state'),
      description: 'Sync state across all windows',
      global: true,
    },
    {
      key: 'h',
      modifiers: ['ctrl', 'shift'],
      action: () => {
        // Show help/shortcuts overlay
        broadcast('show-shortcuts-help');
      },
      description: 'Show keyboard shortcuts help',
      global: true,
    },
    {
      key: 'Escape',
      modifiers: [],
      action: () => {
        if (windowState.windowType === 'assistant') {
          window.electronWindow?.hideWindow(windowState.windowId);
        }
      },
      description: 'Hide assistant window',
      windowTypes: ['assistant'],
    },
  ];

  const allShortcuts = [...defaultShortcuts, ...shortcuts];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const {key, ctrlKey, altKey, shiftKey, metaKey} = event;

      for (const shortcut of allShortcuts) {
        // Check if the key matches
        if (key.toLowerCase() !== shortcut.key.toLowerCase()) continue;

        // Check modifiers
        const modifiers = shortcut.modifiers || [];
        const hasCtrl = modifiers.includes('ctrl') === ctrlKey;
        const hasAlt = modifiers.includes('alt') === altKey;
        const hasShift = modifiers.includes('shift') === shiftKey;
        const hasMeta = modifiers.includes('meta') === metaKey;

        if (!hasCtrl || !hasAlt || !hasShift || !hasMeta) continue;

        // Check window type restrictions
        if (
          shortcut.windowTypes &&
          !shortcut.windowTypes.includes(windowState.windowType)
        ) {
          continue;
        }

        // Execute the shortcut
        event.preventDefault();
        event.stopPropagation();

        try {
          shortcut.action();
        } catch (error) {
          console.error('Error executing keyboard shortcut:', error);
        }

        break;
      }
    },
    [allShortcuts, windowState.windowType],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    shortcuts: allShortcuts,
    addShortcut: (shortcut: KeyboardShortcut) => {
      shortcuts.push(shortcut);
    },
  };
};

// Specialized hook for window-specific shortcuts
export const useWindowShortcuts = (windowType: string) => {
  const shortcuts: KeyboardShortcut[] = [];

  switch (windowType) {
    case 'assistant':
      shortcuts.push(
        {
          key: 'Enter',
          modifiers: ['ctrl'],
          action: () => {
            // Submit message in assistant
            const input = document.querySelector(
              'input[placeholder*="message"]',
            ) as HTMLInputElement;
            if (input) {
              const form = input.closest('form');
              if (form) {
                form.dispatchEvent(
                  new Event('submit', {bubbles: true, cancelable: true}),
                );
              }
            }
          },
          description: 'Send message',
          windowTypes: ['assistant'],
        },
        {
          key: 'b',
          modifiers: ['ctrl'],
          action: () => {
            // Toggle sidebar
            const sidebarButton = document.querySelector(
              '[title*="sidebar"]',
            ) as HTMLButtonElement;
            sidebarButton?.click();
          },
          description: 'Toggle sidebar',
          windowTypes: ['assistant'],
        },
        {
          key: 'p',
          modifiers: [],
          action: () => {
            // Pin/unpin assistant
            const pinButton = document.querySelector(
              '[title*="pin"]',
            ) as HTMLButtonElement;
            pinButton?.click();
          },
          description: 'Toggle pin assistant',
          windowTypes: ['assistant'],
        },
        {
          key: 'm',
          modifiers: [],
          action: () => {
            // Minimize assistant
            const minimizeButton = document.querySelector(
              '[title*="minimize"]',
            ) as HTMLButtonElement;
            minimizeButton?.click();
          },
          description: 'Minimize assistant',
          windowTypes: ['assistant'],
        },
        {
          key: 's',
          modifiers: ['ctrl'],
          action: () => {
            // Save settings (when in settings tab)
            const saveButton = document.querySelector(
              'button:contains("Save")',
            ) as HTMLButtonElement;
            saveButton?.click();
          },
          description: 'Save settings',
          windowTypes: ['assistant'],
        },
        {
          key: 'Tab',
          modifiers: ['ctrl'],
          action: () => {
            // Cycle through assistant tabs
            const tabs = document.querySelectorAll('[role="tab"]');
            const activeTab = document.querySelector(
              '[role="tab"][aria-selected="true"]',
            );
            if (tabs.length > 0 && activeTab) {
              const currentIndex = Array.from(tabs).indexOf(activeTab);
              const nextIndex = (currentIndex + 1) % tabs.length;
              (tabs[nextIndex] as HTMLElement).click();
            }
          },
          description: 'Next assistant tab',
          windowTypes: ['assistant'],
        },
      );
      break;
  }

  return useKeyboardShortcuts(shortcuts);
};
