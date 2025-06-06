import * as React from 'react';
import {Slot} from '@radix-ui/react-slot';
import {cva, type VariantProps} from 'class-variance-authority';
import {cn} from '@/utils/tailwind';
import {useWindowState} from '../../contexts/WindowStateProvider';

const windowButtonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background cursor-pointer transition-all duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground active:scale-95',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:scale-95',
        link: 'text-primary underline-offset-4 hover:underline',
        window:
          'bg-card border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 active:scale-95',
        overlay:
          'bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background/90 hover:border-border active:scale-95',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-8 w-8',
        'icon-sm': 'h-6 w-6 text-xs',
        compact: 'h-7 px-2 py-1 text-xs',
      },
      windowType: {
        main: '',
        assistant: 'shadow-sm',
        settings: 'shadow-sm',
        overlay: 'shadow-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      windowType: 'main',
    },
  },
);

export interface WindowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof windowButtonVariants> {
  asChild?: boolean;
  windowId?: string;
  targetWindow?: string;
  closeOnClick?: boolean;
}

const WindowButton = React.forwardRef<HTMLButtonElement, WindowButtonProps>(
  (
    {
      className,
      variant,
      size,
      windowType,
      asChild = false,
      windowId,
      targetWindow,
      closeOnClick = false,
      onClick,
      ...props
    },
    ref,
  ) => {
    const {windowState, hideWindow} = useWindowState();

    // Auto-detect window type if not provided
    const effectiveWindowType = windowType || (windowState.windowType as any);

    // Auto-detect size based on window type if not provided
    const effectiveSize =
      size ||
      (effectiveWindowType === 'overlay'
        ? 'compact'
        : effectiveWindowType === 'assistant'
          ? 'sm'
          : 'default');

    // Auto-detect variant based on window type if not provided
    const effectiveVariant =
      variant ||
      (effectiveWindowType === 'overlay'
        ? 'overlay'
        : effectiveWindowType === 'assistant' ||
            effectiveWindowType === 'settings'
          ? 'window'
          : 'default');

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Call the original onClick handler first
      onClick?.(event);

      // Handle window-specific actions
      if (closeOnClick && windowState.windowId) {
        hideWindow();
      }

      // Focus target window if specified
      if (targetWindow) {
        window.electronWindow?.focusWindow(targetWindow);
      }
    };

    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(
          windowButtonVariants({
            variant: effectiveVariant,
            size: effectiveSize,
            windowType: effectiveWindowType,
            className,
          }),
        )}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
WindowButton.displayName = 'WindowButton';

export {WindowButton, windowButtonVariants};
