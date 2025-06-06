# Multi-Window Architecture with React Portals

This document explains how the multi-window architecture is implemented in our Electron application using React portals.

## Overview

The multi-window architecture allows us to render React components in separate Electron windows while maintaining a shared state and component library. This approach is based on [this article](https://pietrasiak.com/creating-multi-window-electron-apps-using-react-portals).

## Key Components

### 1. Window Manager Service

The window manager service (`src/helpers/window-manager.ts`) handles the creation, management, and communication between windows in the Electron main process.

```typescript
// Create a new window
createWindow(WindowType.AI_ASSISTANT);

// Show, hide, or toggle a window
showWindow(WindowType.AI_ASSISTANT);
hideWindow(WindowType.AI_ASSISTANT);
toggleWindow(WindowType.AI_ASSISTANT);
```

### 2. Window Manager Context

The window manager context (`src/helpers/ipc/window-manager/window-manager-context.ts`) exposes the window management APIs to the renderer process through the Electron contextBridge.

```typescript
// In renderer process
window.windowManager.createWindow(WindowType.AI_ASSISTANT);
window.windowManager.toggleWindow(WindowType.AI_ASSISTANT);
```

### 3. Portal Component

The Portal component (`src/components/portal/Portal.tsx`) uses React's `createPortal` to render components in different windows.

```tsx
// Render a component in a different window
<Portal windowType={WindowType.AI_ASSISTANT}>
  <AIAssistantWindow />
</Portal>
```

### 4. Shared Context

The AI Assistant context (`src/contexts/AIAssistantContext.tsx`) provides a shared state across all windows.

```tsx
// Wrap your application with the context provider
<AIAssistantProvider>
  <App />
</AIAssistantProvider>

// Use the context in any component
const { isVisible, toggleVisibility } = useAIAssistant();
```

## How It Works

1. The main window creates and manages additional windows through the window manager service.
2. Each window loads the same React application but with a different `windowType` parameter.
3. The application checks the `windowType` parameter to determine what to render in each window.
4. The Portal component handles the creation and management of windows when rendering components.
5. The shared context provides a unified state across all windows.

## Benefits

- **Unified Component Library**: All windows use the same React components.
- **Shared State Management**: State is shared between windows without complex IPC.
- **Hot Reloading**: Works across all windows during development.
- **Consistent Styling**: Same styling and theming across all windows.
- **Easier Testing**: Test components in isolation or in their window context.

## Usage Example

```tsx
// In your main application
import { AIAssistantProvider } from './contexts/AIAssistantContext';
import Portal from './components/portal/Portal';
import AIAssistantWindow from './components/ai-assistant/AIAssistantWindow';
import { WindowType } from './helpers/window-manager';

function App() {
  return (
    <AIAssistantProvider>
      <MainApplication />
      <Portal windowType={WindowType.AI_ASSISTANT}>
        <AIAssistantWindow />
      </Portal>
    </AIAssistantProvider>
  );
}
```

## Adding a New Window Type

1. Add a new window type to the `WindowType` enum in `src/helpers/window-manager.ts`.
2. Create components for the new window.
3. Use the Portal component to render the components in the new window.
4. Create a context for the new window if needed.

## Troubleshooting

- **Window not showing**: Check if the window is being created correctly and if the Portal component is rendering.
- **State not shared**: Ensure that the context provider is wrapping both the main application and the Portal component.
- **Styling issues**: Make sure that the same styling is applied to all windows.