import type React from "react"
import LiquidGlass from "liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassProgressProps {
  value: number
  max?: number
  className?: string
  showLabel?: boolean
  variant?: "default" | "success" | "warning" | "error"
}

export const GlassProgress: React.FC<GlassProgressProps> = ({
  value,
  max = 100,
  className,
  showLabel = false,
  variant = "default",
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  const variantColors = {
    default: "from-blue-500 to-purple-600",
    success: "from-green-500 to-emerald-600",
    warning: "from-yellow-500 to-orange-600",
    error: "from-red-500 to-pink-600",
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <div className="flex justify-between text-sm text-white/80">
          <span>Progress</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}

      <LiquidGlass
        blurAmount={0.04}
        displacementScale={40}
        elasticity={0.12}
        aberrationIntensity={1.5}
        saturation={120}
        cornerRadius={8}
        className="h-2 bg-white/10 border border-white/20 rounded-full overflow-hidden"
      >
        <div
          className={cn("h-full bg-gradient-to-r transition-all duration-500 ease-out", variantColors[variant])}
          style={{ width: `${percentage}%` }}
        />
      </LiquidGlass>
    </div>
  )
}
