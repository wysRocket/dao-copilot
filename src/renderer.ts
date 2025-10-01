import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './App'

console.log('🚀 DAO Copilot: Renderer starting...')

// We previously mounted React only inside a DOMContentLoaded listener. Because the script
// tag is placed at the end of <body>, the DOM is already parsed when this executes, so
// the listener never fired and the page stayed stuck on the static "Loading..." text.
// Fix: mount immediately if the document is already ready; otherwise attach a listener.

declare global {
  interface Window {
    __APP_MOUNTED?: boolean
  }
}

function mountReactApp() {
  console.log('✅ DAO Copilot: Mounting React application...')
  try {
    const appElement = document.getElementById('app')
    if (!appElement) throw new Error('App element not found')

    const root = createRoot(appElement)
    root.render(React.createElement(React.StrictMode, null, React.createElement(App)))
    console.log('✅ DAO Copilot: App rendered successfully!')
    window.__APP_MOUNTED = true
  } catch (error) {
    console.error('🚨 DAO Copilot: Error mounting renderer:', error)
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
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', mountReactApp, {once: true})
  console.log('⏳ DAO Copilot: DOM still loading, deferred mount registered...')
} else {
  // DOM already parsed; mount immediately
  mountReactApp()
}

console.log('✅ DAO Copilot: Renderer bootstrap complete.')
