# DAO Copilot - AI Agent Instructions

## Project Architecture

**DAO Copilot** is an Electron-based AI assistant with real-time audio transcription, built on a multi-window architecture with WebSocket-powered streaming and Gemini Live API integration.

### Core Technology Stack

- **Electron + Vite + React 19**: Multi-window desktop app with hot-reload development
- **TypeScript**: Strict typing across main/renderer/preload processes
- **Zustand**: Fine-grained state management (see `src/state/transcript-state.ts`)
- **Tailwind CSS v4 + liquid-glass-react**: Glassmorphism UI with React 19 compiler optimizations
- **Google Gemini Live API**: Real-time transcription via WebSocket (model: `gemini-live-2.5-flash-preview`)

### Multi-Process Architecture

```
┌─ Main Process (Node.js) ─────────────────────────┐
│  • WindowManager: Multi-window orchestration     │
│  • IPC Handlers: Bi-directional communication    │
│  • Audio Capture: System/mic audio routing       │
│  • Gemini WebSocket: Real-time transcription     │
└───────────────────────────────────────────────────┘
                    ↕ IPC
┌─ Renderer Process (React) ────────────────────────┐
│  • StreamingTextContext: Live text animation     │
│  • Zustand Store: High-performance state         │
│  • Component Routing: Dynamic window content     │
└───────────────────────────────────────────────────┘
```

**Key Pattern**: WindowManager (`src/services/window-manager.ts`) routes components to specific windows (main/assistant) based on `ComponentRoutingRule`. Always check routing rules before adding UI components.

### IPC Communication Pattern

**DO** ✅ Register handlers in modular files under `src/helpers/ipc/`:

```typescript
// src/helpers/ipc/theme/theme-listeners.ts
ipcMain.handle(THEME_MODE_TOGGLE_CHANNEL, () => {
  nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? 'light' : 'dark'
  return nativeTheme.themeSource
})
```

**DON'T** ❌ Register IPC handlers directly in `main.ts` - use the modular pattern via `registerListeners()`.

### State Management Strategy

**Zustand for Global State** (`src/state/transcript-state.ts`):

- Use `subscribeWithSelector` middleware for fine-grained updates
- Slice state into logical domains (transcripts, metadata, filters)
- Example: `useTranscriptStore((state) => state.transcripts)`

**React Context for Feature-Specific State** (`src/contexts/StreamingTextContext.tsx`):

- StreamingText uses context + TextStreamBuffer for animation
- Context wraps components, Zustand handles global persistence

**When to use which**:

- Zustand → App-wide state, persistence, cross-component sharing
- Context → Feature isolation, animation state, component-tree scope

### Audio Transcription Pipeline

**Hybrid Mode Architecture**:

1. **WebSocket Path**: `main-stt-transcription.ts` → `GeminiLiveWebSocketClient` → streaming results
2. **Batch Fallback**: `transcribeAudioViaProxy()` for network failures or small audio chunks
3. **Russian Language Support**: Preprocessor (`russian-audio-preprocessor.ts`) + corrector (`russian-transcription-corrector.ts`)

**Configuration**: Check `TranscriptionOptions` interface for feature flags:

- `enableWebSocket`: Toggle WebSocket mode
- `fallbackToBatch`: Auto-switch to batch on WS failures
- `realTimeThreshold`: Min audio length (ms) for real-time processing

### Service Layer Patterns

**Manager Classes**: Singleton pattern with EventEmitter inheritance

```typescript
// Example from window-manager.ts
export class WindowManager {
  private static instance: WindowManager
  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }
}
```

**Key Services**:

- `WindowManager`: Multi-window lifecycle, component routing
- `TranscriptionSourceManager`: Audio source routing (system/mic/mixed)
- `QuotaManager`: API rate limiting and quota tracking
- `UnifiedPerformanceService`: Performance telemetry

**Service Discovery**: Use `grep -r "class.*Manager" src/services/` to find all managers.

## Development Workflows

### Task-Driven Development

**Use Task Master CLI** for all task management:

```bash
# Start session
task-master list                              # View all tasks
task-master next                              # Get next actionable task
task-master show 8                            # View task details

# Task breakdown
task-master analyze-complexity --research     # Analyze before expanding
task-master expand --id=8 --research          # Break into subtasks

# Progress tracking
task-master set-status --id=8 --status=done   # Mark complete
task-master update --from=9 --prompt="..."    # Update future tasks
```

**GitHub Integration**: Tasks sync to GitHub Issues (see `.github/TASKMASTER_GITHUB_INTEGRATION.md`). Use labels: `taskmaster`, `enhancement`, `testing`.

### Build & Test Commands

```bash
# Development
npm start                    # Start Electron app with hot-reload
npm run dev                  # Alias for start

# Testing
npm run test:unit           # Vitest unit tests
npm run test:e2e            # Playwright E2E tests
npm run test:all            # All tests

# Production builds
npm run build               # Current platform
npm run build:mac           # macOS build
npm run build:win           # Windows build
npm run build:linux         # Linux (DEB preferred)

# Release workflow
npm run release             # Patch version bump + tag
npm run release:minor       # Minor version
npm run release:major       # Major version
```

**Build Configuration**: `forge.config.ts` - note production-only code signing/notarization via env vars (`APPLE_DEVELOPER_ID`, `APPLE_ID`).

### Environment Configuration

**Required API Keys** (`.env` file):

```env
GEMINI_API_KEY=your_api_key_here           # Google Gemini API
GOOGLE_APPLICATION_CREDENTIALS=path/to/sa.json  # Optional service account
```

**Runtime Environment Helpers** (`src/utils/env.ts`):

- `isDevelopmentEnvironment()`: Check dev vs production
- `readRuntimeEnv(key)`: Safe environment variable access
- `readBooleanEnv(key, defaultValue)`: Parse boolean flags

### Debugging Patterns

**Renderer DevTools**: Automatically opens in development mode (see `main.ts`).

**IPC Debugging**: Search for IPC channel usage:

```bash
grep -r "ipcMain.handle\|ipcRenderer.invoke" src/
```

**WebSocket Diagnostics**: Enable validation logging:

```bash
GEMINI_SIGNAL_VALIDATE=1 npm start
```

**Performance Profiling**: Use React DevTools Profiler + `UnifiedPerformanceService` telemetry.

## Project-Specific Conventions

### File Organization

```
src/
├── main.ts              # Electron main entry
├── preload.ts           # Preload script (contextBridge APIs)
├── renderer.ts          # Renderer entry
├── services/            # Business logic, managers, integrations
├── components/          # React components (feature-based)
├── contexts/            # React contexts (streaming, state)
├── state/               # Zustand stores
├── helpers/             # Utilities (IPC, proxy, env)
│   └── ipc/            # IPC handlers (theme, window, audio)
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── workers/            # Web/Audio workers
```

**Naming Convention**: PascalCase for classes/components, camelCase for functions/variables, SCREAMING_SNAKE_CASE for IPC channel constants.

### Component Routing System

**ComponentType → WindowType Mapping** (see `window-manager.ts`):

- `transcription-display` → `assistant` window (fallback: `main`)
- `streaming-text` → `assistant` window
- `websocket-diagnostics` → `assistant` (dev only)

**Adding New Components**:

1. Define `ComponentType` in `WindowManager`
2. Add routing rule to `componentRoutingRules`
3. Use `WindowManager.routeComponent(componentType)` to get target window

### Streaming Text Animation

**TextStreamBuffer Pattern** (`src/services/TextStreamBuffer.ts`):

- Character-by-character animation with debouncing
- Correction detection for transcript updates
- Observable pattern with `subscribe('textUpdate', callback)`

**Integration Example**:

```typescript
const streamBuffer = new TextStreamBuffer({
  debounceDelay: 30, // Fast for live streaming
  autoFlush: true,
  enableCorrectionDetection: true
})

streamBuffer.subscribe('textUpdate', (text, isPartial) => {
  setCurrentStreamingText(text)
})

streamBuffer.addChunk({text: 'hello', isFinal: false})
```

### Error Handling Strategy

**Main Process**: Try-catch with graceful shutdown (`performCleanup()` in `main.ts`)
**Renderer**: React Error Boundaries for UI isolation
**Services**: EventEmitter-based error events (e.g., `emit('error', error)`)

**Fallback Pattern**: WebSocket failures automatically fall back to batch transcription (see `main-stt-transcription.ts`).

### Vite Build Optimization

**Manual Chunk Splitting** (`vite.renderer.config.mts`):

- `react-vendor`: React ecosystem
- `ui-vendor`: Radix UI + Lucide icons
- `audio-processing`: Audio/transcription services
- `ai-services`: Gemini/API integrations
- `state-management`: Contexts/stores

**Why**: Electron apps benefit from granular chunks for faster startup and better caching.

## Integration Points

### Gemini Live API

**WebSocket Client** (`src/services/gemini-live-websocket.ts`):

- Connection pool with reconnection logic
- Heartbeat monitoring
- Tool calling support (see `gemini-tool-call-handler.ts`)

**Authentication**: API key or service account (auto-detected via `gcp-auth-manager.ts`)

**Best Practice**: Always set `responseModality: 'TEXT'` for transcription-only mode to avoid unnecessary audio responses.

### Google Cloud Speech-to-Text (Fallback)

**Proxy Server** (`src/helpers/proxy-server.ts`):

- CORS-bypassing HTTP proxy for GCP APIs
- Auto-starts on main process initialization
- Port: 3001 (configurable)

**Usage**: Import `transcribeAudioViaProxy()` from `proxy-stt-transcription.ts`.

### Multi-Window Communication

**Window Types**: `main` (compact bar), `assistant` (expanded features)

**Broadcasting**: Use `WindowManager.broadcast(channel, ...args)` to send events to all windows.

**Window Lifecycle**:

1. Create via `WindowManager.createWindow(type, config)`
2. Route components via `routeComponent(componentType)`
3. Cleanup via `WindowManager.closeWindow(windowId)`

## Critical Paths & Gotchas

### Don't Break These

1. **Shutdown Sequence**: `performCleanup()` must stop proxy server BEFORE window cleanup to avoid hanging connections
2. **IPC Channel Names**: Use constants from `src/helpers/ipc/channels.ts` (not hardcoded strings)
3. **Zustand Middleware**: Always use `subscribeWithSelector` to avoid unnecessary re-renders
4. **Component Routing**: Never render `assistant`-only components in `main` window without fallback handling
5. **WebSocket Cleanup**: Call `GeminiLiveWebSocketClient.disconnect()` before process exit

### Performance Traps

- **Avoid**: Creating new `TextStreamBuffer` instances per transcription (reuse singleton)
- **Avoid**: Direct DOM manipulation in streaming animation (use React state + RAF)
- **Avoid**: Synchronous file I/O in main process during transcription (use `fs.promises`)

### Common Bugs

- **Transcription not showing**: Check `StreamingTextContext` is wrapping component tree
- **IPC handler not found**: Verify handler registration in `registerListeners()` call chain
- **WebSocket connection fails**: Check `GEMINI_API_KEY` in `.env` and network connectivity
- **Build fails on Linux**: Ensure `rpmbuild` is installed or remove RPM maker from `forge.config.ts`

## Testing Strategy

**Unit Tests**: Vitest for services/utilities (see `src/__tests__/`)
**E2E Tests**: Playwright for multi-window flows (see `tests/`)
**Manual Testing**: Use `npm start:validate` for validation logging

**Coverage Targets** (per Task 9):

- Critical services: 80%+
- UI components: 60%+
- Integration tests: Full transcription pipeline

## Documentation References

- **Gemini Setup**: `docs/GCP_SDK_SETUP_GUIDE.md`
- **Gemini Quick Ref**: `docs/GCP_SDK_QUICK_REFERENCE.md`
- **Task Management**: `.github/instructions/taskmaster.instructions.md`
- **Production Guide**: `docs/PRODUCTION_BUILD_GUIDE.md`
- **Pipeline Reference**: `docs/PIPELINE_REFERENCE.md`

---

**Quick Navigation**:

- Main entry: `src/main.ts` (Electron main process)
- Renderer entry: `src/renderer.ts` (React app)
- Preload: `src/preload.ts` (contextBridge APIs)
- State: `src/state/transcript-state.ts` (Zustand store)
- Transcription: `src/services/main-stt-transcription.ts` (core service)
- Windows: `src/services/window-manager.ts` (multi-window orchestration)

**Remember**: This project uses Task Master for development workflow. Always run `task-master next` to see what to work on next.
