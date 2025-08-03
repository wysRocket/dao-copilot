import React from 'react'
import {createMemoryHistory, createRouter, createRoute} from '@tanstack/react-router'
import {AssistantRootRoute} from './__root-assistant'
import ChatPage from '../pages/assistant/ChatPage'
import TranscriptsPage from '../pages/assistant/TranscriptsPage'
import AnalysisPage from '../pages/assistant/AnalysisPage'
import SettingsPage from '../pages/assistant/SettingsPage'
import AudioDebugPage from '../pages/assistant/AudioDebugPage'

declare module '@tanstack/react-router' {
  interface Register {
    assistantRouter: typeof assistantRouter
  }
}

// Define assistant routes
const ChatRoute = createRoute({
  getParentRoute: () => AssistantRootRoute,
  path: '/chat',
  component: ChatPage
})

const TranscriptsRoute = createRoute({
  getParentRoute: () => AssistantRootRoute,
  path: '/transcripts',
  component: TranscriptsPage
})

const AnalysisRoute = createRoute({
  getParentRoute: () => AssistantRootRoute,
  path: '/analysis',
  component: AnalysisPage
})

const SettingsRoute = createRoute({
  getParentRoute: () => AssistantRootRoute,
  path: '/settings',
  component: SettingsPage
})

const AudioDebugRoute = createRoute({
  getParentRoute: () => AssistantRootRoute,
  path: '/debug/audio',
  component: AudioDebugPage
})

// Default route that redirects to transcripts
const AssistantIndexRoute = createRoute({
  getParentRoute: () => AssistantRootRoute,
  path: '/',
  component: () => <TranscriptsPage />
})

// Create route tree
const assistantRouteTree = AssistantRootRoute.addChildren([
  AssistantIndexRoute,
  ChatRoute,
  TranscriptsRoute,
  AnalysisRoute,
  SettingsRoute,
  AudioDebugRoute
])

// Create assistant router
const assistantHistory = createMemoryHistory({
  initialEntries: ['/transcripts']
})

export const assistantRouter = createRouter({
  routeTree: assistantRouteTree,
  history: assistantHistory
})

export type AssistantRouter = typeof assistantRouter
