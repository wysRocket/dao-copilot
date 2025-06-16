"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import LiquidGlass from "liquid-glass-react"
import { cn } from "../../utils/tailwind"
import { ChevronDown } from "lucide-react"

interface GlassDropdownOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface GlassDropdownProps {
  options: GlassDropdownOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

export const GlassDropdown: React.FC<GlassDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      <LiquidGlass
        blurAmount={0.06}
        displacementScale={60}
        elasticity={0.18}
        aberrationIntensity={2}
        saturation={125}
        cornerRadius={8}
        className="cursor-pointer"
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center space-x-2">
            {selectedOption?.icon}
            <span>{selectedOption?.label || placeholder}</span>
          </span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
        </button>
      </LiquidGlass>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50">
          <LiquidGlass
            blurAmount={0.08}
            displacementScale={70}
            elasticity={0.2}
            aberrationIntensity={2.2}
            saturation={130}
            cornerRadius={8}
            className="bg-black/80 backdrop-blur-md border border-white/20 rounded-md shadow-xl max-h-60 overflow-y-auto"
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="w-full flex items-center space-x-2 px-3 py-2 text-left text-white hover:bg-white/10 transition-colors first:rounded-t-md last:rounded-b-md"
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </LiquidGlass>
        </div>
      )}
    </div>
  )
}
