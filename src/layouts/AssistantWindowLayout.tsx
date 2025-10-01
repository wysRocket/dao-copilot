import React, {useEffect} from 'react'
import {useWindowState} from '../contexts/WindowStateProvider'
import {useTranscriptionState, useWindowCommunication} from '../hooks/useSharedState'
import {useTranscriptStore} from '../state/transcript-state'
import {useGlassEffects} from '../contexts/GlassEffectsProvider'
import {useTheme} from '../contexts/ThemeProvider'
import {StreamingTextProvider} from '../contexts/StreamingTextContext'
import {WindowButton} from '../components/ui/window-button'
import {WindowStatus} from '../components/ui/window-status'
import {BackgroundEffect} from '../components/ui/BackgroundEffect'
import {useNavigate, useRouter} from '@tanstack/react-router'

interface AssistantWindowLayoutProps {
  children: React.ReactNode
}

export default function AssistantWindowLayout({children}: AssistantWindowLayoutProps) {
  const {windowState, updateLocalState} = useWindowState()
  const {transcripts} = useTranscriptionState()
  const {recentEntries} = useTranscriptStore()
  const {sendToWindow, onMessage} = useWindowCommunication()
  const {config: glassConfig} = useGlassEffects()
  const {mode: themeMode} = useTheme()
  const navigate = useNavigate()
  const router = useRouter()

  // Narrowed navigation helper to avoid any-casts while keeping routes safe
  const nav = React.useMemo(() => {
    return (to: AssistantRoute) => {
      // cast navigate to a generic string-based API without using 'any'
      const navFn = navigate as unknown as (opts: {to: string}) => void
      navFn({to})
    }
  }, [navigate])

  // Supported assistant routes
  type AssistantRoute = '/chat' | '/transcripts' | '/analysis' | '/settings'
  const allowedRoutes: readonly AssistantRoute[] = [
    '/chat',
    '/transcripts',
    '/analysis',
    '/settings'
  ] as const
  const toAssistantRoute = (candidate: string): AssistantRoute =>
    allowedRoutes.includes(candidate as AssistantRoute)
      ? (candidate as AssistantRoute)
      : '/transcripts'

  // Listen for navigation messages from other windows
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      if (channel === 'set-assistant-view' && args[0]) {
        const route = toAssistantRoute(`/${args[0]}`)
        nav(route)
      }
      if (channel === 'navigate-assistant-tab' && args[0]) {
        const route = toAssistantRoute(`/${args[0]}`)
        nav(route)
      }
    })

    return unsubscribe
  }, [onMessage, navigate])

  // Get current route to determine active tab
  const currentPath = router.state.location.pathname
  const getCurrentTab = () => {
    if (currentPath.includes('/chat')) return 'chat'
    if (currentPath.includes('/transcripts')) return 'transcripts'
    if (currentPath.includes('/analysis')) return 'analysis'
    if (currentPath.includes('/settings')) return 'settings'
    return 'transcripts' // default
  }

  const currentTab = getCurrentTab()

  // Assistant-specific header with transcription status
  const AssistantHeader = () => (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{
        background: 'var(--glass-heavy)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--glass-border)',
        boxShadow: '0 2px 12px var(--glass-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      }}
    >
      <div className="flex items-center space-x-3">
        <div
          className="h-2 w-2 rounded-full"
          style={{
            background: 'linear-gradient(45deg, #60a5fa, #3b82f6)',
            boxShadow: '0 0 8px rgba(96, 165, 250, 0.5)'
          }}
        ></div>
        <span className="text-sm font-semibold" style={{color: 'var(--text-primary)'}}>
          AI Assistant
        </span>
      </div>

      <div className="flex items-center space-x-4">
        <WindowStatus showRecordingStatus showTranscriptCount showWindowInfo={false} compact />

        {/* Quick actions */}
        <div className="flex space-x-1">
          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={() => sendToWindow('main', 'focus-transcription')}
            title="Focus main window"
            className="h-7 w-7"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </WindowButton>

          <WindowButton
            variant="ghost"
            size="icon-sm"
            onClick={() => updateLocalState('sidebarOpen', !windowState.localState.sidebarOpen)}
            title="Toggle sidebar"
            className="h-7 w-7"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </WindowButton>
        </div>
      </div>
    </div>
  )

  // Assistant-specific footer with tab navigation
  const AssistantFooter = () => (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{
        background: 'var(--glass-heavy)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--glass-border)',
        boxShadow: '0 -2px 12px var(--glass-shadow), inset 0 -1px 0 rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* WindowStatus disabled to remove diagnostic info from footer */}
      {/* <WindowStatus
        showWindowInfo
        showConnectionStatus={false}
        showRecordingStatus={false}
        showTranscriptCount={false}
        compact
      /> */}

      <div className="flex space-x-2">
        <WindowButton
          variant={currentTab === 'chat' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => nav('/chat')}
          className="transition-all duration-200"
        >
          💬 Chat
        </WindowButton>
        <WindowButton
          variant={currentTab === 'transcripts' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => nav('/transcripts')}
          className="transition-all duration-200"
        >
          📝 Transcripts
        </WindowButton>
        <WindowButton
          variant={currentTab === 'analysis' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => nav('/analysis')}
          className="transition-all duration-200"
        >
          📊 Analysis
        </WindowButton>
        <WindowButton
          variant={currentTab === 'settings' ? 'default' : 'ghost'}
          size="compact"
          onClick={() => nav('/settings')}
          className="transition-all duration-200"
        >
          ⚙️ Settings
        </WindowButton>
      </div>
    </div>
  )

  const isDark = themeMode === 'dark'

  // Theme-aware background gradients
  const getBackgroundStyle = () => {
    if (!glassConfig.enabled || !glassConfig.backgroundEffects) {
      return 'var(--bg-primary)'
    }

    if (isDark) {
      return 'linear-gradient(135deg, rgba(15, 20, 25, 0.95) 0%, rgba(26, 26, 26, 0.98) 25%, rgba(30, 35, 40, 0.96) 50%, rgba(26, 26, 26, 0.98) 75%, rgba(15, 20, 25, 0.95) 100%)'
    } else {
      return 'linear-gradient(135deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.98) 25%, rgba(226, 232, 240, 0.96) 50%, rgba(241, 245, 249, 0.98) 75%, rgba(248, 250, 252, 0.95) 100%)'
    }
  }

  // Theme-aware overlay gradients
  const getOverlayStyle = () => {
    if (isDark) {
      return `
        radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.12) 0%, transparent 35%),
        radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.10) 0%, transparent 35%),
        radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.08) 0%, transparent 35%),
        linear-gradient(135deg, rgba(15, 23, 42, 0.3) 0%, rgba(30, 41, 59, 0.2) 50%, rgba(15, 23, 42, 0.3) 100%)
      `
    } else {
      return `
        radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.08) 0%, transparent 35%),
        radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.06) 0%, transparent 35%),
        radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.05) 0%, transparent 35%),
        linear-gradient(135deg, rgba(248, 250, 252, 0.4) 0%, rgba(226, 232, 240, 0.3) 50%, rgba(248, 250, 252, 0.4) 100%)
      `
    }
  }

  return (
    <div
      className="relative flex h-full flex-col"
      style={{
        background: getBackgroundStyle(),
        color: 'var(--text-primary)',
        minHeight: '100vh'
      }}
    >
      {/* Background Effects */}
      {glassConfig.enabled && glassConfig.backgroundEffects && (
        <>
          <BackgroundEffect
            type="mesh"
            intensity="vibrant"
            animated={true}
            className="absolute inset-0"
          />
          {/* Theme-aware gradient overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: getOverlayStyle(),
              opacity: isDark ? 0.6 : 0.4
            }}
          />
        </>
      )}

      <div className="relative z-10">
        <AssistantHeader />
      </div>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {windowState.localState.sidebarOpen && (
          <div
            className="w-52 p-4"
            style={{
              background: 'var(--glass-medium)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderRight: '1px solid var(--glass-border)',
              boxShadow: '2px 0 12px var(--glass-shadow)'
            }}
          >
            <div className="space-y-4">
              <div
                className="text-xs font-semibold tracking-wider uppercase"
                style={{color: 'var(--text-accent)'}}
              >
                Recent Topics
              </div>
              <div className="space-y-2">
                {(() => {
                  // Prefer the most recent finalized entry from the live session
                  const sortedByTime = (arr: Array<{timestamp?: number}>) =>
                    [...arr].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

                  // Collapse duplicates by ID (prefer final and newer)
                  const collapseById = (
                    arr: Array<{id?: string; isFinal?: boolean; timestamp?: number; text?: string}>
                  ) => {
                    const map = new Map<
                      string,
                      {id?: string; isFinal?: boolean; timestamp?: number; text?: string}
                    >()
                    for (const e of arr) {
                      const id = String(e.id ?? '')
                      const prev = map.get(id)
                      if (!prev) {
                        map.set(id, e)
                      } else {
                        const choose =
                          (e.isFinal && !prev.isFinal) ||
                          (e.isFinal === prev.isFinal &&
                            (e.timestamp || 0) >= (prev.timestamp || 0))
                            ? e
                            : prev
                        map.set(id, choose)
                      }
                    }
                    return Array.from(map.values())
                  }

                  const finals = sortedByTime(
                    collapseById((recentEntries || []).filter(e => e.isFinal))
                  )
                  const partials = sortedByTime(
                    collapseById((recentEntries || []).filter(e => e.isPartial))
                  )

                  const sessionItem =
                    finals.length > 0
                      ? finals[finals.length - 1]
                      : partials.length > 0
                        ? partials[partials.length - 1]
                        : undefined

                  // Normalize to a single consistent shape
                  type SidebarItem = {id: string; text: string; timestamp: number}
                  type RecentLike = {id?: string; text?: string; timestamp?: number}
                  const normalize = (item: RecentLike): SidebarItem => ({
                    id: String(item.id ?? `item-${Date.now()}`),
                    text: String(item.text ?? ''),
                    timestamp: Number(item.timestamp ?? Date.now())
                  })

                  // Always show exactly one topic: current session if present, otherwise last historical transcript
                  const fallback: SidebarItem[] =
                    transcripts.length > 0 ? [normalize(transcripts[transcripts.length - 1])] : []
                  const sidebarItems: SidebarItem[] = sessionItem
                    ? [normalize(sessionItem)]
                    : fallback

                  return sidebarItems.map(transcript => (
                    <div
                      key={transcript.id}
                      className="cursor-pointer rounded-lg p-3 text-xs transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
                      style={{
                        background: 'var(--glass-light)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-primary)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}
                      onClick={() => updateLocalState('selectedItems', [transcript.id])}
                    >
                      <div className="mb-1 truncate font-medium">
                        {transcript.text.slice(0, 35)}...
                      </div>
                      <div className="text-xs opacity-70" style={{color: 'var(--text-muted)'}}>
                        Recent
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Main content area - this is where the routed pages will render */}
        <StreamingTextProvider
          onTranscriptionComplete={transcription => {
            console.log('🔴 AssistantWindowLayout: Transcription completed:', transcription)
            // You can handle completed transcriptions here if needed
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </StreamingTextProvider>
      </div>

      <div className="relative z-10">
        <AssistantFooter />
      </div>
    </div>
  )
}
