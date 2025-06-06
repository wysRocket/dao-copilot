import React from 'react';
import {useAIAssistant} from '../../contexts/AIAssistantContext';
import {X} from 'lucide-react';

const AIAssistantHeader: React.FC = () => {
  const {toggleVisibility} = useAIAssistant();

  return (
    <div className="flex items-center justify-between bg-primary p-3 text-primary-foreground">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">Ask AI</span>
      </div>
      <button
        onClick={toggleVisibility}
        className="rounded-full p-1 hover:bg-primary-foreground/10"
        aria-label="Close AI Assistant"
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default AIAssistantHeader;