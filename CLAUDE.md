# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
- `npm run start` - Start the Electron app in development mode
- `npm run lint` - Run ESLint to check code quality
- `npm run format` - Check code formatting with Prettier
- `npm run format:write` - Format code with Prettier

### Testing
- `npm run test` - Run unit tests (Vitest)
- `npm run test:watch` - Run unit tests in watch mode
- `npm run test:unit` - Alias for running Vitest tests
- `npm run test:e2e` - Run end-to-end tests (Playwright)
- `npm run test:all` - Run all tests (requires app to be packaged first)

### Building & Distribution
- `npm run package` - Package the app into platform-specific executable
- `npm run make` - Generate platform distributables (.exe, .dmg, etc)
- `npm run publish` - Publish artifacts to distribution service

**Important**: E2E tests require the app to be packaged first using `package`, `make`, or `publish`.

## Architecture Overview

This is an Electron app using React 19, TypeScript, and modern tooling. Key architectural patterns:

### Electron Process Architecture
- **Main Process** (`src/main.ts`): Creates BrowserWindow with custom title bar (frame: false), manages app lifecycle, installs React DevTools in development
- **Preload Script** (`src/preload.ts`): Exposes secure IPC contexts to renderer using `context-exposer.ts`
- **Renderer Process** (`src/App.tsx`): React app with TanStack Router for navigation

### IPC Communication Pattern
The app uses a structured IPC system in `src/helpers/ipc/`:
- **Context Exposers**: Safely expose APIs to renderer (`theme-context.ts`, `window-context.ts`)
- **Listeners**: Register main process event handlers (`theme-listeners.ts`, `window-listeners.ts`)
- **Channels**: Define IPC channel names and types (`theme-channels.ts`, `window-channels.ts`)

Current IPC implementations:
- Theme switching (dark/light mode)
- Window controls (minimize, maximize, close) for custom title bar

### Frontend Architecture
- **Router**: TanStack Router with memory history for navigation
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Internationalization**: i18next for multi-language support
- **State Management**: React Context + local storage sync for theme/language preferences

### Testing Strategy
- **Unit Tests**: Vitest + React Testing Library for component testing
- **E2E Tests**: Playwright with `electron-playwright-helpers` for full app testing
- **Setup**: Test configuration in `src/tests/setup.ts`

### Key Conventions
- Custom title bar implementation requires both IPC setup and UI components
- Context isolation is enabled for security
- React Compiler is enabled by default
- Use `npx shadcn@canary add <component>` for adding UI components (React 19 + Tailwind v4 compatibility)