import React from "react"
import { LiquidGlass } from "@rdev/liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  variant?: "default" | "subtle" | "strong"
  blur?: number
  opacity?: number
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, children, variant = "default", blur = 10, opacity = 0.1, ...props }, ref) => {
    const variants = {
      default: "backdrop-blur-md bg-white/10 border border-white/20",
      subtle: "backdrop-blur-sm bg-white/5 border border-white/10",
      strong: "backdrop-blur-lg bg-white/20 border border-white/30",
    }

    return (
      <LiquidGlass
        ref={ref}
        className={cn("rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl", variants[variant], className)}
        blur={blur}
        opacity={opacity}
        {...props}
      >
        <div className="p-6">{children}</div>
      </LiquidGlass>
    )
  },
)

GlassCard.displayName = "GlassCard"
