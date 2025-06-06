import React, {useEffect, useState, ReactNode} from 'react';
import {createPortal} from 'react-dom';

interface PortalWindowProps {
  windowId: string;
  children: ReactNode;
  className?: string;
}

export function PortalWindow({
  windowId,
  children,
  className,
}: PortalWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Check if this is a portal window by looking at URL params
    const urlParams = new URLSearchParams(window.location.search);
    const portalId = urlParams.get('portal');

    if (portalId === windowId) {
      // This IS the target portal window - render directly to body
      const portalContainer = document.createElement('div');
      portalContainer.id = `portal-${windowId}`;
      portalContainer.className = className || '';

      // Style the container to fill the window
      portalContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 100vh;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent;
      `;

      document.body.appendChild(portalContainer);
      setContainer(portalContainer);

      return () => {
        if (document.body.contains(portalContainer)) {
          document.body.removeChild(portalContainer);
        }
      };
    } else {
      // This is NOT the target portal window - check if portal window exists
      // This will be handled by the WindowPortalManager
      setContainer(null);
    }
  }, [windowId, className]);

  // Only render if we have a container (meaning this is the correct portal window)
  if (!container) {
    return null;
  }

  return createPortal(children, container);
}

interface WindowPortalManagerProps {
  windowId: string;
  children: ReactNode;
  className?: string;
}

export function WindowPortalManager({
  windowId,
  children,
  className,
}: WindowPortalManagerProps) {
  useEffect(() => {
    // Check if this is the main window (no portal query param)
    const urlParams = new URLSearchParams(window.location.search);
    const portalId = urlParams.get('portal');

    if (!portalId) {
      // This is the main window - portal windows will be managed by WindowManager
      // The actual window creation will be handled by the WindowManager service

      // Create a placeholder container for cleanup purposes
      const placeholder = document.createElement('div');
      placeholder.style.display = 'none';
      document.body.appendChild(placeholder);

      return () => {
        if (document.body.contains(placeholder)) {
          document.body.removeChild(placeholder);
        }
      };
    }

    return undefined;
  }, [windowId]);

  // For main window, return null (portal content will be rendered in the portal window)
  // For portal window, return the PortalWindow component
  const urlParams = new URLSearchParams(window.location.search);
  const portalId = urlParams.get('portal');

  if (portalId === windowId) {
    return (
      <PortalWindow windowId={windowId} className={className}>
        {children}
      </PortalWindow>
    );
  }

  return null;
}

// Hook to detect if we're in a portal window
export function useIsPortalWindow(): string | null {
  const [portalId, setPortalId] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setPortalId(urlParams.get('portal'));
  }, []);

  return portalId;
}

// Hook to check if a specific portal window is active
export function useIsPortalActive(windowId: string): boolean {
  const portalId = useIsPortalWindow();
  return portalId === windowId;
}
