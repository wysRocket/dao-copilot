import React from 'react';
import {useAIAssistant} from '../../contexts/AIAssistantContext';
import {Monitor, Mic, Lightbulb} from 'lucide-react';

const AIAssistantFeatures: React.FC = () => {
  const {
    isListening,
    isScreenMonitoring,
    isProactiveAssistance,
    toggleListening,
    toggleScreenMonitoring,
    toggleProactiveAssistance,
  } = useAIAssistant();

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        Features
      </h3>
      <div className="space-y-3">
        <FeatureToggle
          icon={<Monitor size={18} />}
          title="Screen Monitoring"
          description="Allow AI to see your screen"
          isActive={isScreenMonitoring}
          onToggle={toggleScreenMonitoring}
        />
        <FeatureToggle
          icon={<Mic size={18} />}
          title="Audio Listening"
          description="Allow AI to listen to audio"
          isActive={isListening}
          onToggle={toggleListening}
        />
        <FeatureToggle
          icon={<Lightbulb size={18} />}
          title="Proactive Assistance"
          description="Get suggestions without asking"
          isActive={isProactiveAssistance}
          onToggle={toggleProactiveAssistance}
        />
      </div>
    </div>
  );
};

interface FeatureToggleProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  isActive: boolean;
  onToggle: () => void;
}

const FeatureToggle: React.FC<FeatureToggleProps> = ({
  icon,
  title,
  description,
  isActive,
  onToggle,
}) => {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-start gap-3">
        <div
          className={`rounded-full p-2 ${
            isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          {icon}
        </div>
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={isActive}
          onChange={onToggle}
        />
        <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none"></div>
      </label>
    </div>
  );
};

export default AIAssistantFeatures;