import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {syncThemeWithLocal} from './helpers/theme_helpers';
import {AppContextProvider} from './contexts/AppContext';
import {WindowPortalManager} from './components/portals/PortalWindow';

import {router} from './routes/router';
import {RouterProvider} from '@tanstack/react-router';

// Import portal components
import TitleBarPortal from './components/portals/TitleBarPortal';
import TranscriptPortal from './components/portals/TranscriptPortal';
import AIAssistantPortal from './components/portals/AIAssistantPortal';

export default function App() {
  useEffect(() => {
    syncThemeWithLocal();
  }, []);

  return (
    <AppContextProvider>
      {/* Main application router */}
      <RouterProvider router={router} />

      {/* Portal components - these will render in separate windows when active */}
      <WindowPortalManager windowId="titlebar">
        <TitleBarPortal />
      </WindowPortalManager>

      <WindowPortalManager windowId="transcript">
        <TranscriptPortal />
      </WindowPortalManager>

      <WindowPortalManager windowId="ai-assistant">
        <AIAssistantPortal />
      </WindowPortalManager>
    </AppContextProvider>
  );
}

const root = createRoot(document.getElementById('app')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
