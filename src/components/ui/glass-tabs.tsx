"use client"

import type React from "react"
import { useState } from "react"
import LiquidGlass from "liquid-glass-react"
import { cn } from "../../utils/tailwind"

interface GlassTab {
  id: string
  label: string
  content: React.ReactNode
  icon?: React.ReactNode
}

interface GlassTabsProps {
  tabs: GlassTab[]
  defaultTab?: string
  className?: string
}

export const GlassTabs: React.FC<GlassTabsProps> = ({ tabs, defaultTab, className }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

  const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content

  return (
    <div className={cn("space-y-4", className)}>
      {/* Tab Headers */}
      <LiquidGlass
        blurAmount={0.06}
        displacementScale={65}
        elasticity={0.18}
        aberrationIntensity={2}
        saturation={130}
        cornerRadius={12}
        className="bg-white/5 border border-white/10 rounded-lg p-1"
      >
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                activeTab === tab.id
                  ? "bg-white/20 text-white shadow-md"
                  : "text-white/70 hover:text-white hover:bg-white/10",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </LiquidGlass>

      {/* Tab Content */}
      <LiquidGlass
        blurAmount={0.08}
        displacementScale={70}
        elasticity={0.2}
        aberrationIntensity={2.2}
        saturation={135}
        cornerRadius={16}
        className="bg-white/5 border border-white/10 rounded-lg p-6"
      >
        {activeTabContent}
      </LiquidGlass>
    </div>
  )
}
