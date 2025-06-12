import React, {createContext, useContext, useState, ReactNode} from 'react';

type AssistantTab = 'chat' | 'transcripts' | 'analysis' | 'settings';

interface AssistantNavigationContextType {
  currentTab: AssistantTab;
  navigateToTab: (tab: AssistantTab) => void;
}

const AssistantNavigationContext =
  createContext<AssistantNavigationContextType | null>(null);

export function useAssistantNavigation() {
  const context = useContext(AssistantNavigationContext);
  if (!context) {
    throw new Error(
      'useAssistantNavigation must be used within AssistantNavigationProvider',
    );
  }
  return context;
}

interface AssistantNavigationProviderProps {
  children: ReactNode;
  initialTab?: AssistantTab;
}

export function AssistantNavigationProvider({
  children,
  initialTab = 'chat',
}: AssistantNavigationProviderProps) {
  const [currentTab, setCurrentTab] = useState<AssistantTab>(initialTab);

  const navigateToTab = (tab: AssistantTab) => {
    setCurrentTab(tab);
  };

  return (
    <AssistantNavigationContext.Provider value={{currentTab, navigateToTab}}>
      {children}
    </AssistantNavigationContext.Provider>
  );
}
