# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI co-pilot application that provides an intuitive UI for communicating with Anthropic's Claude. The app features conversation management, configurable model parameters, and persistent chat history.

**Migration Path**: According to the technical analysis in `scripts/Fastest Cross-Platform App Stack_.txt`, the project is planned to migrate from Electron to **Tauri** for better performance, smaller bundle size, faster startup times, and lower resource consumption. Tauri offers the optimal balance of web UI development speed with native performance for command palette-style applications.

## Development Commands

### Building & Running
- `npm run start:dev` - Start development with React dev server + Electron
- `npm run build` - Build React app for production
- `npm run start:prod` - Build and run production version
- `npm run dev` - Start with electron-vite (alternative dev mode)

### Type Checking
- `npm run typecheck` - Run type checking for both Node and web code
- `npm run typecheck:node` - Type check Node/Electron code only
- `npm run typecheck:web` - Type check React/web code only

### Building Distribution
- `npm run package` - Build and package for current platform
- `npm run build:mac` - Build for macOS
- `npm run build:win` - Build for Windows
- `npm run build:linux` - Build for Linux

## Architecture

### Current Build System
The project currently uses two build systems:
1. **react-app-rewired** (legacy) - for React development server and builds
2. **electron-vite** - for modern Electron development with Vite

**Future Architecture**: The project will transition to Tauri, which uses:
- **Rust backend** - for system integrations, security, and performance
- **Web frontend** - allowing reuse of existing React/web components
- **Native webviews** - instead of bundling Chromium, reducing app size significantly

### Key Directories
- `src/` - Main application source
  - `app/` - Core React application and routing
  - `features/` - Feature-specific components (Chat, Conversations, ApiSettings, Sidebar)
  - `redux/` - State management with Redux Toolkit and persistence
  - `ui/` - Reusable UI components
  - `theme/` - Theme system with light/dark mode support
  - `main/` - Electron main process
  - `preload/` - Electron preload scripts
  - `renderer/` - Alternative renderer setup for electron-vite

### State Management
Uses Redux Toolkit with redux-persist for state persistence:
- `apiSettings` - AI model configuration and API settings
- `chats` - Conversation management and chat history
- `theme` - Theme preferences

### Styling
- SCSS modules for component-specific styles
- Global theme system with CSS custom properties
- Material-UI integration
- Tailwind CSS (in renderer directory)

### Path Aliases
- `@/*` - Maps to `src/*` (main codebase)
- `@renderer/*` - Maps to `src/renderer/src/*` (electron-vite renderer)

## Task Management Integration

This project uses Task Master for development workflow management. Key files:
- `tasks/tasks.json` - Main task definitions
- `tasks/task_*.txt` - Individual task details
- `.cursor/rules/` - Development guidelines and workflow rules

When working on tasks:
1. Check current tasks with Task Master tools
2. Follow the iterative subtask implementation process
3. Update task status and log progress regularly
4. Maintain dependency chains when modifying tasks

## Important Patterns

### Component Structure
- Each feature has its own directory with index.ts exports
- SCSS modules follow ComponentName.module.scss naming
- Components use TypeScript with proper interface definitions

### API Integration
- API configuration stored in Redux state
- Prompt API handles communication with AI services
- Settings allow switching between different AI models

### Theme System
- CustomThemeProvider wraps the app
- Theme state persisted in Redux
- CSS custom properties for dynamic theming
- Both light and dark themes supported

## File Structure Notes

The project has mixed structure due to evolution:
- Legacy React structure in main `src/`
- Modern electron-vite structure in `src/renderer/`
- Dual TypeScript configs for different build targets
- Both package systems maintained for compatibility

## Migration Considerations

When migrating to Tauri:
1. **Preserve UI Components** - The existing React components in `src/features/` and `src/ui/` can be reused
2. **Redux State** - State management with Redux Toolkit can remain, but persistence layer may need adjustment
3. **API Layer** - Current API integration in `src/api/` will need adaptation for Tauri's invoke system
4. **System Features** - Global hotkeys, window management, and tray functionality will benefit from Tauri's security-focused architecture
5. **Performance Goals** - Target sub-500ms startup time and <40MB memory usage (vs current Electron overhead)

## Technical Priorities for Tauri Migration

Based on the stack analysis, focus on:
- **Global hotkey implementation** using `tauri-plugin-global-shortcut`
- **Frameless overlay windows** with `tauri-plugin-spotlight` for command palette behavior
- **Security model** leveraging Rust's memory safety and Tauri's capability-based permissions
- **Bundle optimization** to achieve the target 2.5-10MB application size