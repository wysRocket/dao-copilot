"use client"

import type React from "react"
import { GlassCard } from "../components/ui/glass-card"
import { GlassNavigation, GlassNavItem } from "../components/ui/glass-navigation"
import { GlassSidebar } from "../components/ui/glass-sidebar"
import { CustomTitleBar } from "../components/CustomTitleBar"

interface GlassWindowLayoutProps {
  children: React.ReactNode
  showSidebar?: boolean
  sidebarContent?: React.ReactNode
  navigationItems?: Array<{
    label: string
    active?: boolean
    onClick?: () => void
  }>
}

export const GlassWindowLayout: React.FC<GlassWindowLayoutProps> = ({
  children,
  showSidebar = false,
  sidebarContent,
  navigationItems = [],
}) => {
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <CustomTitleBar />

      {/* Navigation */}
      {navigationItems.length > 0 && (
        <div className="p-4 pb-0">
          <GlassNavigation>
            {navigationItems.map((item, index) => (
              <GlassNavItem key={index} active={item.active} onClick={item.onClick}>
                {item.label}
              </GlassNavItem>
            ))}
          </GlassNavigation>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {showSidebar && sidebarContent && <GlassSidebar>{sidebarContent}</GlassSidebar>}

        {/* Main Content */}
        <div className="flex-1 p-4">
          <GlassCard className="h-full">{children}</GlassCard>
        </div>
      </div>
    </div>
  )
}
