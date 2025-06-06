import React, {createContext, useContext, useState, useEffect} from 'react';
import {WindowType} from '../helpers/window-manager';

// Define the AI Assistant context interface
interface AIAssistantContextType {
  isVisible: boolean;
  toggleVisibility: () => void;
  message: string;
  setMessage: (message: string) => void;
  isListening: boolean;
  isScreenMonitoring: boolean;
  isProactiveAssistance: boolean;
  toggleListening: () => void;
  toggleScreenMonitoring: () => void;
  toggleProactiveAssistance: () => void;
}

// Create the context with default values
const AIAssistantContext = createContext<AIAssistantContextType>({
  isVisible: false,
  toggleVisibility: () => {},
  message: '',
  setMessage: () => {},
  isListening: false,
  isScreenMonitoring: false,
  isProactiveAssistance: false,
  toggleListening: () => {},
  toggleScreenMonitoring: () => {},
  toggleProactiveAssistance: () => {},
});

// Create a provider component
export const AIAssistantProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState(
    'Hi, I'm Cluely! I can help you with your tasks by monitoring your screen, listening to audio, and providing proactive assistance.',
  );
  const [isListening, setIsListening] = useState(false);
  const [isScreenMonitoring, setIsScreenMonitoring] = useState(false);
  const [isProactiveAssistance, setIsProactiveAssistance] = useState(false);

  // Check if the AI Assistant window is visible on mount
  useEffect(() => {
    if (window.windowManager) {
      window.windowManager
        .isWindowVisible(WindowType.AI_ASSISTANT)
        .then((visible) => {
          setIsVisible(visible);
        })
        .catch((error) => {
          console.error('Error checking window visibility:', error);
        });
    }
  }, []);

  // Toggle the visibility of the AI Assistant window
  const toggleVisibility = async () => {
    if (window.windowManager) {
      try {
        await window.windowManager.toggleWindow(WindowType.AI_ASSISTANT);
        const visible = await window.windowManager.isWindowVisible(
          WindowType.AI_ASSISTANT,
        );
        setIsVisible(visible);
      } catch (error) {
        console.error('Error toggling window visibility:', error);
      }
    }
  };

  // Toggle listening state
  const toggleListening = () => {
    setIsListening((prev) => !prev);
  };

  // Toggle screen monitoring state
  const toggleScreenMonitoring = () => {
    setIsScreenMonitoring((prev) => !prev);
  };

  // Toggle proactive assistance state
  const toggleProactiveAssistance = () => {
    setIsProactiveAssistance((prev) => !prev);
  };

  // Create the context value
  const contextValue: AIAssistantContextType = {
    isVisible,
    toggleVisibility,
    message,
    setMessage,
    isListening,
    isScreenMonitoring,
    isProactiveAssistance,
    toggleListening,
    toggleScreenMonitoring,
    toggleProactiveAssistance,
  };

  return (
    <AIAssistantContext.Provider value={contextValue}>
      {children}
    </AIAssistantContext.Provider>
  );
};

// Create a hook to use the AI Assistant context
export const useAIAssistant = () => useContext(AIAssistantContext);

export default AIAssistantContext;