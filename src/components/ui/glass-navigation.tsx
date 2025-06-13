import type React from "react"
import { LiquidGlass } from "@rdev/liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassNavigationProps {
  children: React.ReactNode
  className?: string
  orientation?: "horizontal" | "vertical"
}

export const GlassNavigation: React.FC<GlassNavigationProps> = ({
  children,
  className,
  orientation = "horizontal",
}) => {
  return (
    <LiquidGlass
      className={cn(
        "backdrop-blur-md bg-white/5 border border-white/10",
        "shadow-lg rounded-lg",
        orientation === "horizontal" ? "flex items-center space-x-1 p-2" : "flex flex-col space-y-1 p-2",
        className,
      )}
      blur={10}
      opacity={0.05}
    >
      {children}
    </LiquidGlass>
  )
}

interface GlassNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: React.ReactNode
}

export const GlassNavItem: React.FC<GlassNavItemProps> = ({ active = false, children, className, ...props }) => {
  return (
    <button
      className={cn(
        "px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
        "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20",
        active ? "bg-white/20 text-white shadow-md" : "text-white/70 hover:text-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
