# Persistent Answer Display System

## Overview

The Persistent Answer Display System provides state management for real-time AI answer streaming that persists across page navigation in the DAO Copilot assistant window. This solves the issue where switching between Chat Page and Transcript Page would reset the rendered text.

## Architecture

### Core Components

1. **AnswerDisplayProvider** - Context provider that manages persistent state
2. **PersistentRealTimeAnswerDisplay** - Main answer display component using shared state
3. **AnswerDisplayCard** - Compact view for showing answer state on other pages

### State Management

The system uses React Context to maintain answer display state that persists across component unmount/mount cycles during navigation.

```typescript
interface AnswerDisplayContextState {
  currentDisplay: AnswerDisplay | null
  searchState: SearchState | null
  isStreaming: boolean
  isInitialized: boolean
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  error: string | null
  displayHistory: AnswerDisplay[]
  lastUpdateTime: number
}
```

## Usage

### Setup

The `AnswerDisplayProvider` is automatically configured in the assistant router root:

```tsx
// src/routes/__root-assistant.tsx
<AnswerDisplayProvider
  defaultConfig={{
    enableDebugLogging: process.env.NODE_ENV === 'development',
    showSearchProgress: true,
    enableTypewriterEffect: true,
    typewriterSpeed: 30
  }}
>
  <AssistantWindowLayout>
    <Outlet />
  </AssistantWindowLayout>
</AnswerDisplayProvider>
```

### Chat Page Implementation

Replace the original `RealTimeAnswerDisplay` with `PersistentRealTimeAnswerDisplay`:

```tsx
// src/pages/assistant/ChatPage.tsx
import PersistentRealTimeAnswerDisplay from '../../components/PersistentRealTimeAnswerDisplay'

// In component render:
;<PersistentRealTimeAnswerDisplay
  show={showRealTimeAnswer}
  question={currentQuestion}
  onAnswerComplete={handleAnswerComplete}
  className="w-full"
/>
```

### Transcripts Page Integration

Add the `AnswerDisplayCard` to show persistent answer state:

```tsx
// src/pages/assistant/TranscriptsPage.tsx
import AnswerDisplayCard from '../../components/AnswerDisplayCard'

// In component render:
;<AnswerDisplayCard
  showOnlyWithAnswer={true}
  compact={true}
  className="w-full"
  maxHeight="max-h-32"
/>
```

## Key Features

### State Persistence

- Answer text persists when navigating between pages
- Search progress is maintained across page switches
- Streaming state continues seamlessly
- Connection status is shared across components

### Performance Optimization

- Single shared WebSocket connection
- Shared AnswerDisplayManager instance
- Throttled updates to prevent excessive re-renders
- Memory efficient state management

### Error Handling

- Graceful degradation when services fail to initialize
- Connection status indicators
- Error state propagation to UI components

## Hooks

### useAnswerDisplay

Full access to context state and actions:

```tsx
const {
  currentDisplay,
  searchState,
  isStreaming,
  startAnswerDisplay,
  clearCurrentDisplay,
  getDisplayManager
} = useAnswerDisplay()
```

### useAnswerDisplayState (Read-only)

Access to state only, for display components:

```tsx
const {currentDisplay, searchState, isStreaming, isInitialized, connectionStatus} =
  useAnswerDisplayState()
```

### useAnswerDisplayActions

Access to actions only, for control components:

```tsx
const {startAnswerDisplay, clearCurrentDisplay, updateConfig} = useAnswerDisplayActions()
```

## Component Props

### PersistentRealTimeAnswerDisplay

```typescript
interface PersistentRealTimeAnswerDisplayProps {
  show: boolean
  question?: string
  className?: string
  onAnswerComplete?: (answer: AnswerDisplay) => void
  onSearchStateChange?: (state: SearchState) => void
  onDisplayCleared?: () => void
  compact?: boolean
  showDebug?: boolean
  showControls?: boolean
  theme?: 'light' | 'dark' | 'glass'
  forceNew?: boolean // Force start new display even if question is the same
}
```

### AnswerDisplayCard

```typescript
interface AnswerDisplayCardProps {
  className?: string
  compact?: boolean
  showDebug?: boolean
  theme?: 'light' | 'dark' | 'glass'
  maxHeight?: string
  showOnlyWithAnswer?: boolean // Only show when there's active answer
}
```

## Configuration

The system accepts configuration through the provider:

```typescript
interface AnswerDisplayConfig {
  maxHistorySize: number
  showSearchProgress: boolean
  showConfidence: boolean
  showSources: boolean
  showMetadata: boolean
  enableTypewriterEffect: boolean
  typewriterSpeed: number
  updateThrottleMs: number
  enableDebugLogging: boolean
}
```

## Best Practices

1. **Use PersistentRealTimeAnswerDisplay on Chat Page** - For interactive question/answer
2. **Use AnswerDisplayCard on other pages** - For showing persistent state
3. **Set showOnlyWithAnswer={true}** - On secondary pages to avoid empty state
4. **Use compact mode** - On pages where space is limited
5. **Enable debug mode** - During development for troubleshooting

## Troubleshooting

### State Not Persisting

- Verify AnswerDisplayProvider wraps all assistant pages
- Check that components are using the correct hooks
- Ensure the provider is not being unmounted/remounted

### Connection Issues

- Check WebSocket configuration
- Verify network connectivity
- Monitor connectionStatus in debug mode

### Performance Issues

- Reduce updateThrottleMs for faster updates
- Increase throttling for better performance
- Monitor component re-renders with React DevTools

## Migration Guide

### From RealTimeAnswerDisplay

1. Replace import:

   ```tsx
   // Before
   import RealTimeAnswerDisplay from '../../components/RealTimeAnswerDisplay'

   // After
   import PersistentRealTimeAnswerDisplay from '../../components/PersistentRealTimeAnswerDisplay'
   ```

2. Update component usage:

   ```tsx
   // Before
   <RealTimeAnswerDisplay
     show={show}
     question={question}
     config={config}
   />

   // After
   <PersistentRealTimeAnswerDisplay
     show={show}
     question={question}
     // config is now handled by provider
   />
   ```

3. Add provider to router root (already done in this implementation)

### Adding to New Pages

1. Import the card component:

   ```tsx
   import AnswerDisplayCard from '../../components/AnswerDisplayCard'
   ```

2. Add to render method:
   ```tsx
   <AnswerDisplayCard showOnlyWithAnswer={true} compact={true} />
   ```

This system ensures that users can seamlessly switch between Chat and Transcript pages while maintaining their answer context, significantly improving the user experience.
