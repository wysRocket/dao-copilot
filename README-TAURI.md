# Tauri Migration Guide

This document provides instructions for working with the Tauri implementation alongside the existing Electron setup.

## Development Setup

### Prerequisites
- Rust (install from https://rustup.rs/)
- Node.js (already installed)
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Running Tauri Development
```bash
# Start Tauri development server
npm run tauri:dev

# Get Tauri system information
npm run tauri:info

# Build Tauri app for production
npm run tauri:build
```

### Running Electron (Current)
```bash
# Continue using existing Electron commands
npm run start:dev
npm run dev
```

## Architecture Overview

### Current Implementation
- **Electron**: Main desktop application (existing)
- **Tauri**: Alternative desktop implementation (new)
- **Web**: Browser fallback for both

### File Structure
```
src-tauri/           # Tauri Rust backend
├── src/
│   └── main.rs      # Main Tauri application
├── tauri.conf.json  # Tauri configuration
├── Cargo.toml       # Rust dependencies
└── build.rs         # Build script

src/hooks/
└── useTauri.ts      # React hook for Tauri integration
```

### Platform Detection
The `useTauri` hook automatically detects the runtime environment:
- `isDesktop`: Running in Tauri
- `isElectron`: Running in Electron  
- `isWeb`: Running in browser

## Migration Strategy

### Phase 1: Foundation (Current)
- ✅ Basic Tauri setup with Rust backend
- ✅ Tauri configuration for window management
- ✅ React hook for platform detection
- ✅ Build scripts integration

### Phase 2: Feature Parity
- [ ] Port Electron features to Tauri commands
- [ ] System tray implementation
- [ ] Global hotkeys
- [ ] File system operations
- [ ] Auto-updater

### Phase 3: Optimization
- [ ] Bundle size optimization
- [ ] Performance benchmarking
- [ ] Security hardening
- [ ] Platform-specific features

## Available Tauri Commands

### `greet(name: string)`
Test command that returns a greeting message.

### `get_system_info()`
Returns system information including platform, architecture, and version.

## Configuration

### Security
Tauri uses a capability-based security model. Current permissions in `tauri.conf.json`:
- Window management (close, hide, show, maximize, minimize)
- File system operations (read, write, create, delete)
- Shell operations (open external links)
- Path utilities

### Bundle Configuration
- **App Name**: DAO Copilot
- **Bundle ID**: com.wysrocket.dao-copilot
- **Targets**: All platforms (Windows, macOS, Linux)

## Building for Production

### Tauri
```bash
npm run tauri:build
```
Output: `src-tauri/target/release/bundle/`

### Electron (Existing)
```bash
npm run package
```

## Migration Notes

### State Management
- Redux Toolkit state can be preserved
- Persistence layer needs adaptation for Tauri's security model
- Consider using Tauri's built-in state management for new features

### API Integration
- Current API calls in `src/api/` work unchanged
- Consider moving sensitive operations to Rust backend
- Use Tauri commands for system-level integrations

### Styling
- All existing CSS/SCSS works unchanged
- Tauri uses native webviews, so rendering may differ slightly
- Test thoroughly on all target platforms

## Next Steps

1. **Test Basic Functionality**: Run `npm run tauri:dev` and verify the app loads
2. **Port Core Features**: Identify critical Electron features to port
3. **Performance Testing**: Compare Tauri vs Electron performance
4. **User Testing**: Get feedback on native feel and performance

## Troubleshooting

### Common Issues
- **Rust not found**: Install Rust from https://rustup.rs/
- **Build failures**: Check Rust toolchain version
- **Permission errors**: Review `tauri.conf.json` allowlist
- **API not available**: Check `useTauri` hook implementation

### Development Tips
- Use `npm run tauri:info` for system diagnostics
- Check browser dev tools in Tauri dev mode
- Rust compilation takes time on first build
- Hot reload works for frontend changes only