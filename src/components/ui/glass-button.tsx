import React from "react"
import { LiquidGlass } from "@rdev/liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
  children: React.ReactNode
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    const variants = {
      default: "bg-white/10 hover:bg-white/20 border border-white/20 text-white",
      primary: "bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-100",
      secondary: "bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 text-gray-100",
      ghost: "bg-transparent hover:bg-white/10 border border-transparent text-white/80 hover:text-white",
    }

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    }

    return (
      <LiquidGlass
        as="button"
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-all duration-200",
          "backdrop-blur-md shadow-lg hover:shadow-xl",
          "focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className,
        )}
        blur={8}
        opacity={0.1}
        {...props}
      >
        {children}
      </LiquidGlass>
    )
  },
)

GlassButton.displayName = "GlassButton"
