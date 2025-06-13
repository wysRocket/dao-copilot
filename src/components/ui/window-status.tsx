import * as React from "react";
import { cn } from "@/utils/tailwind";
import { useWindowState } from "../../contexts/WindowStateProvider";
import { useSharedState } from "../../hooks/useSharedState";

export interface WindowStatusProps {
  className?: string;
  showWindowInfo?: boolean;
  showConnectionStatus?: boolean;
  showRecordingStatus?: boolean;
  showTranscriptCount?: boolean;
  compact?: boolean;
}

export const WindowStatus: React.FC<WindowStatusProps> = ({
  className,
  showWindowInfo = true,
  showConnectionStatus = false,
  showRecordingStatus = true,
  showTranscriptCount = false,
  compact = false,
}) => {
  const { windowState } = useWindowState();
  const { isRecording, transcripts, isProcessing } = useSharedState();

  const getRecordingStatusColor = () => {
    if (isRecording) return "bg-red-500";
    if (isProcessing) return "bg-yellow-500";
    return "bg-gray-400";
  };

  const getRecordingStatusText = () => {
    if (isRecording) return "Recording";
    if (isProcessing) return "Processing";
    return "Ready";
  };

  const getWindowTypeIcon = () => {
    switch (windowState.windowType) {
      case 'main': return '🏠';
      case 'assistant': return '🤖';
      case 'settings': return '⚙️';
      case 'overlay': return '📌';
      default: return '🪟';
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center space-x-2 text-xs text-muted-foreground", className)}>
        {showRecordingStatus && (
          <div className="flex items-center space-x-1">
            <div className={cn("w-1.5 h-1.5 rounded-full", getRecordingStatusColor(), {
              "animate-pulse": isRecording
            })}></div>
            <span className="sr-only">{getRecordingStatusText()}</span>
          </div>
        )}
        
        {showTranscriptCount && (
          <span>{transcripts.length}</span>
        )}
        
        {showWindowInfo && (
          <span>{getWindowTypeIcon()}</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center space-x-4 text-xs text-muted-foreground", className)}>
      {showWindowInfo && (
        <div className="flex items-center space-x-2">
          <span>{getWindowTypeIcon()}</span>
          <span className="capitalize">{windowState.windowType}</span>
          {windowState.windowId && (
            <span className="font-mono">#{windowState.windowId.slice(-4)}</span>
          )}
        </div>
      )}

      {showRecordingStatus && (
        <div className="flex items-center space-x-2">
          <div className={cn("w-2 h-2 rounded-full", getRecordingStatusColor(), {
            "animate-pulse": isRecording
          })}></div>
          <span>{getRecordingStatusText()}</span>
        </div>
      )}

      {showTranscriptCount && (
        <div className="flex items-center space-x-1">
          <span>📝</span>
          <span>{transcripts.length} transcripts</span>
        </div>
      )}

      {showConnectionStatus && (
        <div className="flex items-center space-x-2">
          <div className={cn("w-2 h-2 rounded-full", 
            windowState.isFocused ? "bg-green-500" : "bg-gray-400"
          )}></div>
          <span>{windowState.isFocused ? 'Focused' : 'Background'}</span>
        </div>
      )}
    </div>
  );
};
