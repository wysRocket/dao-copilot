import React from 'react'
import TestGlassComponent from '../components/TestGlassComponent'

export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="space-y-4 text-center">
          <TestGlassComponent title="DAO Copilot - Glass UI Test">
            <p>This demonstrates the liquid-glass-react integration working successfully!</p>
            <div className="mt-2 text-xs opacity-75">
              Build configuration updated and component rendered without issues.
            </div>
          </TestGlassComponent>
        </div>
      </div>
    </div>
  )
}
