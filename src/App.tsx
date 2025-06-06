import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {syncThemeWithLocal} from './helpers/theme_helpers';

import {router} from './routes/router';
import {RouterProvider} from '@tanstack/react-router';
import {AIAssistantProvider} from './contexts/AIAssistantContext';
import Portal from './components/portal/Portal';
import AIAssistantWindow from './components/ai-assistant/AIAssistantWindow';
import {WindowType} from './helpers/window-manager';

export default function App() {
  useEffect(() => {
    syncThemeWithLocal();
  }, []);

  // Get the current window type
  const windowType = window.windowManager?.getCurrentWindowType();

  // If this is the AI Assistant window, render only the AI Assistant UI
  if (windowType === WindowType.AI_ASSISTANT) {
    return (
      <AIAssistantProvider>
        <AIAssistantWindow />
      </AIAssistantProvider>
    );
  }

  // Otherwise, render the main application with the router
  return (
    <AIAssistantProvider>
      <RouterProvider router={router} />
      {/* The Portal component will handle rendering in the appropriate window */}
      <Portal windowType={WindowType.AI_ASSISTANT}>
        <AIAssistantWindow />
      </Portal>
    </AIAssistantProvider>
  );
}

const root = createRoot(document.getElementById('app')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
