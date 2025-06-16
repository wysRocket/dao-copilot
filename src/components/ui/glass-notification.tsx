"use client"

import type React from "react"
import { useEffect, useState } from "react"
import LiquidGlass from "liquid-glass-react"
import { cn } from "../../utils/tailwind"
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react"

interface GlassNotificationProps {
  type?: "success" | "error" | "warning" | "info"
  title: string
  message?: string
  isVisible: boolean
  onClose: () => void
  autoClose?: boolean
  duration?: number
}

export const GlassNotification: React.FC<GlassNotificationProps> = ({
  type = "info",
  title,
  message,
  isVisible,
  onClose,
  autoClose = true,
  duration = 5000,
}) => {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true)
      if (autoClose) {
        const timer = setTimeout(() => {
          onClose()
        }, duration)
        return () => clearTimeout(timer)
      }
    } else {
      setIsAnimating(false)
    }
  }, [isVisible, autoClose, duration, onClose])

  const typeConfig = {
    success: {
      icon: CheckCircle,
      color: "text-green-400",
      borderColor: "border-green-400/30",
      bgColor: "bg-green-500/10",
    },
    error: {
      icon: AlertCircle,
      color: "text-red-400",
      borderColor: "border-red-400/30",
      bgColor: "bg-red-500/10",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-yellow-400",
      borderColor: "border-yellow-400/30",
      bgColor: "bg-yellow-500/10",
    },
    info: {
      icon: Info,
      color: "text-blue-400",
      borderColor: "border-blue-400/30",
      bgColor: "bg-blue-500/10",
    },
  }

  const config = typeConfig[type]
  const Icon = config.icon

  if (!isVisible) return null

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 transition-all duration-300 transform",
        isAnimating ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
      )}
    >
      <LiquidGlass
        blurAmount={0.1}
        displacementScale={75}
        elasticity={0.22}
        aberrationIntensity={2.5}
        saturation={140}
        cornerRadius={12}
        className={cn("max-w-sm backdrop-blur-md border shadow-xl", config.borderColor, config.bgColor)}
      >
        <div className="p-4">
          <div className="flex items-start space-x-3">
            <Icon className={cn("w-5 h-5 mt-0.5 flex-shrink-0", config.color)} />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-white">{title}</h4>
              {message && <p className="mt-1 text-sm text-white/70">{message}</p>}
            </div>
            <button onClick={onClose} className="flex-shrink-0 p-1 text-white/60 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </LiquidGlass>
    </div>
  )
}
