import React from 'react'
import TestGlassComponent from '../components/TestGlassComponent'
import ToggleTheme from '../components/ToggleTheme'

export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      {/* Theme toggle for testing */}
      <div className="absolute top-4 right-4 z-10">
        <ToggleTheme />
      </div>
      
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="space-y-4 text-center">
          <TestGlassComponent title="DAO Copilot - Glass UI Test">
            <p>This demonstrates the liquid-glass-react integration working successfully!</p>
            <div className="mt-2 text-xs opacity-75">
              Build configuration updated and component rendered without issues.
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
              <p className="text-sm text-foreground">Theme system is now active!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the toggle button above to switch between light and dark themes.
              </p>
            </div>
          </TestGlassComponent>
        </div>
      </div>
    </div>
  )
}
