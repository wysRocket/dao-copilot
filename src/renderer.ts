import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './App'

console.log('🚀 DAO Copilot: Renderer starting...')

// Wait for DOM to be ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('� DAO Copilot: DOM loaded, mounting React...')

  try {
    const appElement = document.getElementById('app')
    if (!appElement) {
      throw new Error('App element not found')
    }

    console.log('✅ DAO Copilot: App element found, mounting full app...')

    const root = createRoot(appElement)
    root.render(React.createElement(React.StrictMode, null, React.createElement(App)))

    console.log('✅ DAO Copilot: FULL App rendered successfully!')
  } catch (error) {
    console.error('🚨 DAO Copilot: Error in renderer:', error)

    const appElement = document.getElementById('app')
    if (appElement) {
      appElement.innerHTML = `
        <div style="padding: 20px; color: red; font-family: Arial;">
          <h1>🚨 DAO Copilot - Renderer Error</h1>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p>Check console for details</p>
        </div>
      `
    }
  }
})

console.log('✅ DAO Copilot: Renderer script loaded, waiting for DOM...')
