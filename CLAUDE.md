# DAO Copilot - Electron Audio Capture & Transcription Application

## Project Overview

This is an Electron-based desktop application that captures system audio and microphone input for speech-to-text transcription using Google's Gemini AI. The application features a multi-window architecture with a persistent title bar and supports real-time audio processing.

## Architecture Overview

### Core Technologies
- **Electron 36.0.0** - Desktop application framework
- **React 19.1.0** - UI framework with React Compiler enabled
- **TypeScript** - Type-safe development
- **Vite** - Build tool and development server
- **TailwindCSS 4.1.4** - Styling with shadcn/ui components
- **Tanstack Router** - Client-side routing
- **Google Gemini AI** - Speech-to-text transcription

### Multi-Window Architecture

The application uses a sophisticated multi-window setup:

1. **Main Window** (`src/main.ts`)
   - Primary content window (900x670px)
   - Hidden title bar (`titleBarStyle: 'hiddenInset'`)
   - Houses the main React application

2. **Title Bar Window** (`src/titlebar.tsx`)
   - Always-on-top persistent title bar (full screen width x 50px height)
   - Transparent background, visible on all workspaces
   - Contains audio capture controls and transcription triggers

3. **Transcript Window** (created dynamically)
   - Shows transcription results in real-time
   - Managed through IPC communication

## Project Structure

```
src/
├── main.ts                    # Electron main process entry point
├── preload.ts                 # Preload script for context isolation
├── renderer.ts                # Renderer process entry point
├── App.tsx                    # Main React application
├── titlebar.tsx              # Title bar window React app
├── transcript.tsx            # Transcript window React app
├── components/               # React components
│   ├── ui/                  # shadcn/ui components
│   └── CustomTitleBar.tsx   # Main title bar component
├── helpers/
│   ├── ipc/                 # IPC communication layer
│   │   ├── ai/             # AI-related IPC handlers
│   │   ├── audio/          # Audio capture IPC handlers
│   │   ├── transcription/  # Transcription IPC handlers
│   │   ├── theme/          # Theme management IPC
│   │   └── window/         # Window management IPC
│   ├── environment-config.ts # Environment variable management
│   ├── proxy-server.ts      # Local proxy server for API calls
│   └── theme_helpers.ts     # Theme utilities
├── services/
│   ├── main-stt-transcription.ts  # Main transcription service (Gemini AI)
│   ├── proxy-stt-transcription.ts # Proxy fallback service
│   ├── audio_capture.ts           # Audio capture implementation
│   └── wav.ts                     # WAV file processing
├── pages/
│   └── HomePage.tsx         # Main page component
├── routes/                  # Tanstack Router configuration
├── layouts/                 # Layout components
├── styles/
│   └── global.css          # Global styles with TailwindCSS
└── types/                  # TypeScript type definitions
```

## IPC Communication Pattern

The application uses a structured IPC pattern with:

### Channel Definition
Each feature has its own channel constants (e.g., `transcription-channels.ts`)

### Context Exposure
Preload scripts expose APIs to renderer processes (`*-context.ts` files)

### Event Listeners
Main process handlers for IPC events (`*-listeners.ts` files)

### Example IPC Flow:
```typescript
// Channel definition
export const TRANSCRIPTION_TRANSCRIBE_CHANNEL = 'transcription:transcribe';

// Context exposure (preload)
contextBridge.exposeInMainWorld('transcriptionAPI', {
  transcribeAudio: (audioData: Uint8Array) =>
    ipcRenderer.invoke(TRANSCRIPTION_TRANSCRIBE_CHANNEL, audioData),
});

// Event listener (main process)
ipcMain.handle(TRANSCRIPTION_TRANSCRIBE_CHANNEL, async (_event, audioData) => {
  // Process transcription
});
```

## Development Workflow

### Available Scripts
```bash
# Development
npm run start              # Start Electron in development mode
npm run lint              # Run ESLint
npm run format            # Check code formatting
npm run format:write      # Fix code formatting

# Testing
npm run test              # Run unit tests (Vitest)
npm run test:watch        # Run tests in watch mode
npm run test:e2e          # Run E2E tests (Playwright)
npm run test:all          # Run all tests

# Building & Distribution
npm run package           # Package application
npm run make              # Create distributables
npm run publish           # Publish application
```

### Build Configuration

- **Electron Forge** - Application packaging and distribution
- **Vite** - Multiple entry points:
  - `src/main.ts` → Main process
  - `src/preload.ts` → Preload script  
  - `index.html` → Main window
  - `titlebar.html` → Title bar window
  - `transcript.html` → Transcript window

### Code Quality Tools

- **ESLint** - Linting with TypeScript, React, and React Compiler rules
- **Prettier** - Code formatting
- **Vitest** - Unit testing with jsdom environment
- **Playwright** - E2E testing
- **TypeScript** - Type checking

## Key Features & Services

### Audio Capture
- System audio (loopback) capture
- Microphone input capture
- WAV file processing and encoding
- Real-time audio streaming

### Speech-to-Text Transcription
- **Primary**: Direct Google Gemini API calls (`main-stt-transcription.ts`)
- **Fallback**: Proxy server for API calls (`proxy-stt-transcription.ts`)
- Automatic fallback mechanism if direct calls fail
- Configurable Gemini model (default: `gemini-2.5-flash-preview-05-20`)

### Environment Configuration
Supports multiple environment variable formats for API keys:
- `GOOGLE_API_KEY`
- `VITE_GOOGLE_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GEMINI_API_KEY`

### Theme Management
- Light/dark theme support
- Persistent theme preferences
- System theme synchronization

## Configuration Files

### Essential Configs
- `forge.config.ts` - Electron Forge packaging configuration
- `vite.renderer.config.mts` - Renderer process Vite config
- `vite.main.config.ts` - Main process Vite config
- `vite.preload.config.ts` - Preload script Vite config
- `components.json` - shadcn/ui component configuration
- `eslint.config.mjs` - ESLint configuration
- `vitest.config.ts` - Unit test configuration
- `playwright.config.ts` - E2E test configuration

## Security & Best Practices

### Electron Security
- Context isolation enabled
- Node integration disabled
- Sandbox mode disabled (required for audio capture)
- Preload scripts for secure IPC communication

### Code Quality
- React Compiler enabled for optimization
- Strict TypeScript configuration
- Comprehensive linting rules
- Test coverage reporting

## Development Tips

### Environment Setup
1. Install dependencies: `npm install`
2. Set up environment variables for Google API key
3. Start development: `npm run start`

### Common Development Tasks

#### Adding New IPC Channels
1. Define channel constant in `*-channels.ts`
2. Add context exposure in `*-context.ts`
3. Implement listener in `*-listeners.ts`
4. Register listener in `listeners-register.ts`

#### Adding New UI Components
- Use shadcn/ui components when possible
- Components are in `src/components/ui/`
- Custom components in `src/components/`
- Follow TailwindCSS patterns

#### Testing
- Unit tests: `src/tests/unit/`
- E2E tests: `src/tests/e2e/`
- Test utilities and setup in respective directories

### Debugging
- Development DevTools available via F12
- Console logging throughout IPC communication
- Electron main process debugging available

## Dependencies Overview

### Core Runtime Dependencies
- Audio processing: Native Electron APIs
- AI/ML: `@google/genai` for Gemini API
- UI: React 19 with TailwindCSS 4
- Routing: `@tanstack/react-router`
- State: React built-in state management

### Development Dependencies
- Build: Electron Forge + Vite
- Testing: Vitest + Playwright
- Quality: ESLint + Prettier + TypeScript

This application demonstrates advanced Electron architecture patterns, multi-window management, real-time audio processing, and modern React development practices.