import React from 'react'
import {
  createMemoryHistory,
  createRouter,
  createRootRoute,
  createRoute,
  Outlet
} from '@tanstack/react-router'
import ChatPage from '../pages/assistant/ChatPage'
import TranscriptsPage from '../pages/assistant/TranscriptsPage'
import AnalysisPage from '../pages/assistant/AnalysisPage'
import SettingsPage from '../pages/assistant/SettingsPage'

// Create root route for assistant window
const assistantRootRoute = createRootRoute({
  component: () => (
    <div id="assistant-router-root">
      <AssistantRouter />
    </div>
  )
})

// Define routes for assistant window
const chatRoute = createRoute({
  getParentRoute: () => assistantRootRoute,
  path: '/',
  component: ChatPage
})

const transcriptsRoute = createRoute({
  getParentRoute: () => assistantRootRoute,
  path: '/transcripts',
  component: TranscriptsPage
})

const analysisRoute = createRoute({
  getParentRoute: () => assistantRootRoute,
  path: '/analysis',
  component: AnalysisPage
})

const settingsRoute = createRoute({
  getParentRoute: () => assistantRootRoute,
  path: '/settings',
  component: SettingsPage
})

// Create route tree
const assistantRouteTree = assistantRootRoute.addChildren([
  chatRoute,
  transcriptsRoute,
  analysisRoute,
  settingsRoute
])

// Create memory history for assistant window
const assistantHistory = createMemoryHistory({
  initialEntries: ['/']
})

// Create assistant router
export const assistantRouter = createRouter({
  routeTree: assistantRouteTree,
  history: assistantHistory
})

// Assistant router component
export function AssistantRouter() {
  return (
    <div className="h-full">
      <Outlet />
    </div>
  )
}

// Route paths for navigation
export const assistantRoutes = {
  chat: '/',
  transcripts: '/transcripts',
  analysis: '/analysis',
  settings: '/settings'
} as const

// Navigation helper
export const navigateToAssistantTab = (tab: keyof typeof assistantRoutes) => {
  assistantRouter.navigate({to: assistantRoutes[tab] as string, from: '/'})
}
