import React from 'react';
import {useAIAssistant} from '../../contexts/AIAssistantContext';

const AIAssistantResponse: React.FC = () => {
  const {message} = useAIAssistant();

  return (
    <div className="p-4">
      <div className="rounded-lg bg-card p-4 shadow-sm">
        <p className="text-card-foreground">{message}</p>
      </div>
    </div>
  );
};

export default AIAssistantResponse;