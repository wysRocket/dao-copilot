import React from 'react';
import {useAIAssistant} from '../../contexts/AIAssistantContext';
import {Bot} from 'lucide-react';

const AIAssistantToggle: React.FC = () => {
  const {isVisible, toggleVisibility} = useAIAssistant();

  return (
    <button
      onClick={toggleVisibility}
      className={`fixed bottom-4 right-4 flex items-center gap-2 rounded-full ${
        isVisible ? 'bg-primary text-primary-foreground' : 'bg-muted'
      } px-4 py-2 shadow-md transition-all hover:bg-primary hover:text-primary-foreground`}
      aria-label={isVisible ? 'Hide AI Assistant' : 'Show AI Assistant'}
    >
      <Bot size={18} />
      <span className="font-medium">Ask AI</span>
    </button>
  );
};

export default AIAssistantToggle;