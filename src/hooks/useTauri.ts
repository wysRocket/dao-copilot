import { useState, useEffect } from 'react';

// Tauri API imports with optional loading
let tauriApi: any = null;
let tauriInvoke: any = null;

try {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    tauriApi = (window as any).__TAURI__;
    tauriInvoke = tauriApi.tauri.invoke;
  }
} catch (error) {
  console.log('Tauri API not available, running in web mode');
}

export const useTauri = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [systemInfo, setSystemInfo] = useState<any>(null);

  useEffect(() => {
    const checkTauriAvailability = async () => {
      if (tauriInvoke) {
        setIsDesktop(true);
        try {
          const info = await tauriInvoke('get_system_info');
          setSystemInfo(info);
        } catch (error) {
          console.error('Failed to get system info:', error);
        }
      }
    };

    checkTauriAvailability();
  }, []);

  const invoke = async (command: string, args?: any) => {
    if (!tauriInvoke) {
      console.warn('Tauri invoke not available');
      return null;
    }
    
    try {
      return await tauriInvoke(command, args);
    } catch (error) {
      console.error(`Failed to invoke ${command}:`, error);
      throw error;
    }
  };

  const openExternal = async (url: string) => {
    if (tauriApi?.shell?.open) {
      await tauriApi.shell.open(url);
    } else {
      // Fallback for web/electron
      window.open(url, '_blank');
    }
  };

  return {
    isDesktop,
    systemInfo,
    invoke,
    openExternal,
    isElectron: !isDesktop && typeof window !== 'undefined' && (window as any).require,
    isWeb: !isDesktop && typeof window !== 'undefined' && !(window as any).require
  };
};

export default useTauri;