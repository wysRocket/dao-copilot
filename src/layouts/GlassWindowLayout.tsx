import React from 'react'
import {GlassCard} from '../components/ui/glass-card'
import {GlassNavigation, GlassNavItem} from '../components/ui/glass-navigation'
import {GlassSidebar} from '../components/ui/glass-sidebar'
import LiquidGlassTitleBar from '../components/LiquidGlassTitleBar'

interface GlassWindowLayoutProps {
  children: React.ReactNode
  showSidebar?: boolean
  sidebarContent?: React.ReactNode
  navigationItems?: Array<{
    label: string
    active?: boolean
    onClick?: () => void
  }>
  titleBarVariant?: 'default' | 'assistant' | 'minimal'
  backgroundVariant?: 'default' | 'gradient' | 'solid'
}

export const GlassWindowLayout: React.FC<GlassWindowLayoutProps> = ({
  children,
  showSidebar = false,
  sidebarContent,
  navigationItems = [],
  titleBarVariant = 'default',
  backgroundVariant = 'default'
}) => {
  const getBackgroundClass = () => {
    switch (backgroundVariant) {
      case 'gradient':
        return 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'
      case 'solid':
        return 'bg-slate-900'
      default:
        return 'bg-gradient-to-br from-slate-900/95 via-purple-900/95 to-slate-900/95 backdrop-blur-sm'
    }
  }

  return (
    <div className={`flex h-screen flex-col ${getBackgroundClass()}`}>
      <LiquidGlassTitleBar variant={titleBarVariant} className="flex-shrink-0" />

      {/* Navigation */}
      {navigationItems.length > 0 && (
        <div className="flex-shrink-0 p-4 pb-0">
          <GlassNavigation>
            {navigationItems.map((item, index) => (
              <GlassNavItem key={index} active={item.active} onClick={item.onClick}>
                {item.label}
              </GlassNavItem>
            ))}
          </GlassNavigation>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && sidebarContent && (
          <div className="flex-shrink-0">
            <GlassSidebar>{sidebarContent}</GlassSidebar>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 p-4">
          <GlassCard
            className="h-full"
            variant="default"
            liquidGlassProps={{
              mouseContainer: null, // Use the window as mouse container
              mode: 'standard'
            }}
          >
            {children}
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
