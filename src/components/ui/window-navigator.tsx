import * as React from "react";
import { cn } from "@/utils/tailwind";
import { usePortalManager } from "../portals/PortalManager";
import { useWindowState } from "../../contexts/WindowStateProvider";
import { WindowButton } from "./window-button";

export interface WindowNavigatorProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  showLabels?: boolean;
  showCurrentWindow?: boolean;
  compact?: boolean;
}

export const WindowNavigator: React.FC<WindowNavigatorProps> = ({
  className,
  orientation = 'horizontal',
  showLabels = true,
  showCurrentWindow = false,
  compact = false,
}) => {
  const { allWindows, createWindow, focusWindow, showWindow } = usePortalManager();
  const { windowState } = useWindowState();

  const windowTypes = [
    { type: 'main', icon: '🏠', label: 'Main', color: 'blue' },
    { type: 'assistant', icon: '🤖', label: 'Assistant', color: 'green' },
    { type: 'settings', icon: '⚙️', label: 'Settings', color: 'gray' },
    { type: 'overlay', icon: '📌', label: 'Overlay', color: 'purple' },
  ];

  const getWindowForType = (type: string) => {
    return allWindows.find(w => w.type === type);
  };

  const handleWindowAction = async (type: string) => {
    const existingWindow = getWindowForType(type);
    
    if (existingWindow) {
      if (existingWindow.isVisible) {
        focusWindow(existingWindow.windowId);
      } else {
        showWindow(existingWindow.windowId);
      }
    } else {
      try {
        await createWindow(type);
      } catch (error) {
        console.error(`Failed to create ${type} window:`, error);
      }
    }
  };

  const getButtonVariant = (type: string) => {
    const existingWindow = getWindowForType(type);
    const isCurrent = windowState.windowType === type;
    
    if (isCurrent && showCurrentWindow) return 'default';
    if (existingWindow?.isVisible) return 'secondary';
    if (existingWindow) return 'outline';
    return 'ghost';
  };

  const getButtonState = (type: string) => {
    const existingWindow = getWindowForType(type);
    const isCurrent = windowState.windowType === type;
    
    if (isCurrent && showCurrentWindow) return 'current';
    if (existingWindow?.isVisible) return 'visible';
    if (existingWindow) return 'hidden';
    return 'none';
  };

  return (
    <div className={cn(
      "flex items-center gap-1",
      orientation === 'vertical' ? 'flex-col' : 'flex-row',
      className
    )}>
      {windowTypes.map(({ type, icon, label, color }) => {
        const buttonState = getButtonState(type);
        const isCurrent = windowState.windowType === type;
        
        // Don't show current window button unless explicitly requested
        if (isCurrent && !showCurrentWindow) return null;

        return (
          <div key={type} className="relative">
            <WindowButton
              variant={getButtonVariant(type)}
              size={compact ? "icon-sm" : showLabels ? "default" : "icon"}
              onClick={() => handleWindowAction(type)}
              className={cn(
                "relative transition-all duration-200",
                isCurrent && "ring-2 ring-primary ring-offset-2",
                buttonState === 'visible' && `border-${color}-500/50`,
                buttonState === 'hidden' && "opacity-60",
              )}
              title={`${label} Window ${buttonState === 'visible' ? '(Open)' : buttonState === 'hidden' ? '(Hidden)' : '(Create)'}`}
            >
              <span className="text-sm">{icon}</span>
              {showLabels && !compact && (
                <span className="ml-2 text-xs">{label}</span>
              )}
            </WindowButton>
            
            {/* Status indicator */}
            <div className={cn(
              "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-background transition-colors",
              buttonState === 'visible' && `bg-${color}-500`,
              buttonState === 'hidden' && `bg-${color}-300`,
              buttonState === 'current' && "bg-primary",
              buttonState === 'none' && "bg-transparent border-transparent"
            )}></div>
          </div>
        );
      })}
      
      {/* Quick actions */}
      <div className={cn(
        "flex gap-1 border-l pl-2 ml-2",
        orientation === 'vertical' && "border-l-0 border-t pt-2 mt-2 flex-col"
      )}>
        <WindowButton
          variant="ghost"
          size={compact ? "icon-sm" : "icon"}
          onClick={() => {
            allWindows.forEach(w => {
              if (w.isVisible && w.type !== 'main') {
                focusWindow(w.windowId);
              }
            });
          }}
          title="Focus All Windows"
          className="text-xs"
        >
          🔍
        </WindowButton>
        
        <WindowButton
          variant="ghost"
          size={compact ? "icon-sm" : "icon"}
          onClick={() => window.electronWindow?.broadcast('sync-state')}
          title="Sync All Windows"
          className="text-xs"
        >
          🔄
        </WindowButton>
      </div>
    </div>
  );
};
