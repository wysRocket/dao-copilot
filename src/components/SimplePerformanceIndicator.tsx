import React from 'react';

/**
 * Simple, high-performance transcription display component
 * Replaces complex PerformanceDashboard that was causing 996ms render times
 */
export const SimplePerformanceIndicator: React.FC = () => {
  return (
    <div className="flex items-center space-x-2 text-xs text-green-500">
      <div className="h-2 w-2 rounded-full bg-green-500"></div>
      <span>Ready</span>
    </div>
  );
};
