import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {WindowType} from '../../helpers/window-manager';

interface PortalProps {
  windowType: WindowType;
  children: React.ReactNode;
}

/**
 * A component that renders its children in a different window using React Portal
 */
const Portal: React.FC<PortalProps> = ({windowType, children}) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [targetWindow, setTargetWindow] = useState<Window | null>(null);

  useEffect(() => {
    // Check if we're already in the target window
    const currentWindowType = window.windowManager?.getCurrentWindowType();
    if (currentWindowType === windowType) {
      // We're already in the target window, render directly
      setContainer(document.getElementById('app'));
      return;
    }

    // Create or show the target window
    const createOrShowWindow = async () => {
      try {
        // Check if the window is already visible
        const isVisible = await window.windowManager.isWindowVisible(windowType);
        
        if (!isVisible) {
          // Create the window if it doesn't exist or is not visible
          await window.windowManager.createWindow(windowType);
        }
        
        // We can't directly access the window object of the new window from here
        // The content will be rendered when the component is mounted in that window
      } catch (error) {
        console.error('Error creating or showing window:', error);
      }
    };

    createOrShowWindow();
  }, [windowType]);

  // If we're in the target window, render the children
  if (window.windowManager?.getCurrentWindowType() === windowType) {
    return <>{children}</>;
  }

  // If we're not in the target window, don't render anything
  return null;
};

export default Portal;