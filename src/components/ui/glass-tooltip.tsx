"use client"

import type React from "react"
import { useState } from "react"
import LiquidGlass from "liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassTooltipProps {
  children: React.ReactNode
  content: string
  position?: "top" | "bottom" | "left" | "right"
  delay?: number
}

export const GlassTooltip: React.FC<GlassTooltipProps> = ({ children, content, position = "top", delay = 500 }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)

  const showTooltip = () => {
    const id = setTimeout(() => setIsVisible(true), delay)
    setTimeoutId(id)
  }

  const hideTooltip = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      setTimeoutId(null)
    }
    setIsVisible(false)
  }

  const positionClasses = {
    top: "bottom-full left-1/2 transform -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 transform -translate-x-1/2 mt-2",
    left: "right-full top-1/2 transform -translate-y-1/2 mr-2",
    right: "left-full top-1/2 transform -translate-y-1/2 ml-2",
  }

  return (
    <div className="relative inline-block" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      {children}
      {isVisible && (
        <div className={cn("absolute z-50 whitespace-nowrap", positionClasses[position])}>
          <LiquidGlass
            blurAmount={0.08}
            displacementScale={50}
            elasticity={0.15}
            aberrationIntensity={1.5}
            saturation={125}
            cornerRadius={8}
            className="bg-black/80 backdrop-blur-md border border-white/20 px-2 py-1 text-sm text-white shadow-lg"
          >
            {content}
          </LiquidGlass>
        </div>
      )}
    </div>
  )
}
