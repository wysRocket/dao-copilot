import React from 'react';
import AIAssistantHeader from './AIAssistantHeader';
import AIAssistantResponse from './AIAssistantResponse';
import AIAssistantFeatures from './AIAssistantFeatures';
import AIAssistantInput from './AIAssistantInput';
import DragWindowRegion from '../DragWindowRegion';

const AIAssistantWindow: React.FC = () => {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden rounded-lg bg-background shadow-lg">
      <DragWindowRegion title="Drag to move the AI Assistant" />
      <AIAssistantHeader />
      <div className="flex-1 overflow-y-auto">
        <AIAssistantResponse />
        <AIAssistantFeatures />
      </div>
      <AIAssistantInput />
    </div>
  );
};

export default AIAssistantWindow;