import * as React from "react";
import { cn } from "@/utils/tailwind";
import { useWindowState } from "../../contexts/WindowStateProvider";
import { useSharedState } from "../../hooks/useSharedState";

export interface WindowInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  syncKey?: string; // Key to sync with shared state
  localKey?: string; // Key to sync with window local state
  persistOnBlur?: boolean;
  windowType?: string;
}

const WindowInput = React.forwardRef<HTMLInputElement, WindowInputProps>(
  ({ 
    className, 
    type,
    syncKey,
    localKey,
    persistOnBlur = true,
    windowType,
    value,
    onChange,
    onBlur,
    ...props 
  }, ref) => {
    const { windowState, updateLocalState } = useWindowState();
    const { updateSharedState, sharedState } = useSharedState();
    
    // Auto-detect window type if not provided
    const effectiveWindowType = windowType || windowState.windowType;
    
    // Get the appropriate value source
    const getValue = () => {
      if (value !== undefined) return value;
      if (syncKey) return (sharedState as any)[syncKey] || '';
      if (localKey) return windowState.localState[localKey] || '';
      return '';
    };

    const [internalValue, setInternalValue] = React.useState(getValue());

    // Update internal value when external sources change
    React.useEffect(() => {
      setInternalValue(getValue());
    }, [syncKey && (sharedState as any)[syncKey], localKey && windowState.localState[localKey], value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.value;
      setInternalValue(newValue);
      
      // Update appropriate state immediately
      if (syncKey) {
        updateSharedState(syncKey as any, newValue);
      } else if (localKey) {
        updateLocalState(localKey, newValue);
      }
      
      // Call original onChange handler
      onChange?.(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (persistOnBlur) {
        if (syncKey) {
          updateSharedState(syncKey as any, internalValue);
        } else if (localKey) {
          updateLocalState(localKey, internalValue);
        }
      }
      
      // Call original onBlur handler
      onBlur?.(event);
    };

    // Window-specific styling
    const getWindowStyles = () => {
      switch (effectiveWindowType) {
        case 'overlay':
          return "h-7 px-2 py-1 text-xs bg-background/90 backdrop-blur-sm border-border/50";
        case 'assistant':
        case 'settings':
          return "h-9 px-3 py-2 text-sm bg-background border-border";
        default:
          return "h-10 px-3 py-2 text-sm bg-background border-border";
      }
    };

    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md border border-input bg-background ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          getWindowStyles(),
          className
        )}
        ref={ref}
        value={internalValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    );
  },
);
WindowInput.displayName = "WindowInput";

export { WindowInput };