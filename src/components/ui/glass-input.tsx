import React from "react"
import { LiquidGlass } from "@rdev/liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && <label className="block text-sm font-medium text-white/80">{label}</label>}
        <LiquidGlass
          className={cn(
            "relative overflow-hidden rounded-md",
            "backdrop-blur-md bg-white/5 border border-white/20",
            "focus-within:border-white/40 focus-within:bg-white/10",
            "transition-all duration-200",
            error && "border-red-400/50 focus-within:border-red-400/70",
          )}
          blur={6}
          opacity={0.05}
        >
          <input
            ref={ref}
            className={cn(
              "w-full px-3 py-2 bg-transparent text-white placeholder-white/50",
              "focus:outline-none focus:ring-0",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className,
            )}
            {...props}
          />
        </LiquidGlass>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    )
  },
)

GlassInput.displayName = "GlassInput"
