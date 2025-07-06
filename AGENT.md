# AGENT.md - Codebase Guide

## Build/Lint/Test Commands
- **Development**: `npm run start` (Electron Forge)
- **Build/Package**: `npm run make` or `npm run package` 
- **Linting**: `npm run lint` (ESLint with TypeScript + React)
- **Formatting**: `npm run format` (check) or `npm run format:write` (fix)
- **Unit Tests**: `npm run test:unit` (Vitest in `src/tests/unit/`)
- **E2E Tests**: `npm run test:e2e` (Playwright in `src/tests/e2e/`)
- **All Tests**: `npm run test:all` (both unit and e2e)
- **Single Test**: `vitest run <test-file>` or `npx playwright test <test-file>`

## Architecture & Structure
- **Type**: Electron app with multi-window support (main/renderer/preload architecture)
- **Frontend**: React 19 + TypeScript + TanStack Router + Tailwind CSS
- **Key Services**: Audio recording/transcription with Google Cloud Speech + Gemini AI
- **Glass UI**: Uses `liquid-glass-react` for glassmorphism effects
- **IPC**: Electron IPC for main-renderer communication (`src/helpers/ipc/`)
- **State Management**: Custom shared state hooks for multi-window coordination
- **Audio Pipeline**: Real-time audio capture → WebSocket → Gemini Live integration

## Code Style & Conventions  
- **Imports**: Use `@/` for src imports, absolute paths preferred
- **Components**: PascalCase, use `.tsx` extension, glass-enhanced UI components
- **Types**: TypeScript strict mode, interfaces in `types.d.ts` for globals
- **Styling**: Tailwind classes + `cn()` utility from `@/utils/tailwind`
- **Error Handling**: Use try-catch with logging via `logger` service
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Glass Effects**: Consistent glassmorphism using GlassBox/GlassCard components
