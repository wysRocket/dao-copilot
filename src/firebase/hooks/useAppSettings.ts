import { useUserSettings } from './useUserSettings';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

const LOCAL_KEY = 'app_settings';

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalSettings(data: any) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export function useAppSettings() {
  const { user } = useAuth();
  const userSettings = useUserSettings();

  const settings = user ? userSettings.settings : getLocalSettings();
  const isLoading = user ? userSettings.isLoading : false;
  const isError = user ? userSettings.isError : false;

  const updateSettings = useCallback(async (data: any) => {
    if (user) {
      await userSettings.updateSettings(data);
    } else {
      setLocalSettings({ ...getLocalSettings(), ...data });
    }
  }, [user, userSettings]);

  return {
    settings,
    isLoading,
    isError,
    updateSettings,
    updating: user ? userSettings.updating : false,
  };
}
