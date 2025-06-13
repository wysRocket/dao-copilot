import type React from "react"
import { LiquidGlass } from "@rdev/liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassSidebarProps {
  children: React.ReactNode
  className?: string
  width?: "sm" | "md" | "lg"
}

export const GlassSidebar: React.FC<GlassSidebarProps> = ({ children, className, width = "md" }) => {
  const widths = {
    sm: "w-48",
    md: "w-64",
    lg: "w-80",
  }

  return (
    <LiquidGlass
      className={cn(
        "h-full backdrop-blur-xl bg-white/5 border-r border-white/10",
        "shadow-xl",
        widths[width],
        className,
      )}
      blur={12}
      opacity={0.05}
    >
      <div className="p-4 h-full overflow-y-auto">{children}</div>
    </LiquidGlass>
  )
}
