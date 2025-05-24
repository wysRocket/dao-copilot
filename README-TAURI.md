# Tauri Migration Guide for DAO Copilot

This document provides a comprehensive guide for the migration from Electron to Tauri for DAO Copilot.

## Overview

DAO Copilot is migrating from Electron to Tauri to achieve:
- **Better Performance**: Sub-500ms startup time vs Electron's 2-3s
- **Smaller Bundle Size**: 2.5-10MB vs Electron's 100-200MB
- **Lower Memory Usage**: <40MB vs Electron's 80-150MB
- **Enhanced Security**: Rust's memory safety + capability-based permissions
- **Native Performance**: System webviews instead of bundled Chromium

## Current Implementation Status

### ✅ Completed (Sub-task 1: Foundation)
- [x] Basic Tauri configuration with security-focused allowlist
- [x] Rust backend with fundamental commands (greet, platform info, conversation management)
- [x] React platform detection hook (`useTauri`) for Tauri/Electron/Web compatibility
- [x] Package.json integration with Tauri scripts
- [x] System tray and global shortcut foundation
- [x] Window management and visibility controls

### 🚧 Pending (Remaining Sub-tasks)
- [ ] **Sub-task 2**: Backend API with Rust and Axum (3 days)
- [ ] **Sub-task 3**: PostgreSQL database setup and migrations (2 days)
- [ ] **Sub-task 4**: Google Cloud Platform infrastructure (2 days)
- [ ] **Sub-task 5**: Docker containerization (2 days)  
- [ ] **Sub-task 6**: CI/CD pipeline configuration (3 days)

## Development Setup

### Prerequisites
```bash
# Install Rust (required for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Tauri CLI globally (optional but recommended)
npm install -g @tauri-apps/cli
```

### Development Commands

#### Tauri Development
```bash
# Start Tauri development server (React + Rust backend)
npm run tauri:dev

# Build Tauri application for production
npm run tauri:build

# Get system information for debugging
npm run tauri:info

# Generate application icons
npm run tauri:icon path/to/icon.png
```

#### Existing Electron (Still Available)
```bash
# Start Electron development (legacy)
npm run start:dev

# Build Electron production
npm run start:prod

# Package Electron app
npm run package
```

#### Mixed Development
```bash
# React development server only (for web testing)
npm start

# Type checking
npm run typecheck

# Build React app
npm run build
```

## Architecture Changes

### Current Structure (Preserved)
```
src/
├── app/              # Core React application
├── features/         # Feature components (Chat, Conversations, etc.)
├── redux/           # State management (preserved)
├── ui/              # Reusable UI components
├── theme/           # Theme system
├── hooks/           # React hooks (+ new useTauri hook)
├── main/            # Electron main process (legacy)
└── preload/         # Electron preload (legacy)
```

### New Tauri Structure
```
src-tauri/
├── src/
│   └── main.rs      # Rust backend with commands
├── tauri.conf.json  # Tauri configuration
├── build.rs         # Build script
├── Cargo.toml       # Rust dependencies
└── icons/           # Application icons
```

## Platform Detection and API Usage

### React Hook Usage
```typescript
import { useTauri } from '@/hooks/useTauri';

function MyComponent() {
  const { platformInfo, greet, saveConversation, isTauriAvailable } = useTauri();

  useEffect(() => {
    console.log('Running on:', platformInfo.platform); // 'tauri' | 'electron' | 'web'
    
    if (isTauriAvailable) {
      greet('User').then(message => console.log(message));
    }
  }, []);

  return (
    <div>
      <p>Platform: {platformInfo.platform}</p>
      <p>Desktop App: {platformInfo.isDesktop ? 'Yes' : 'No'}</p>
      {isTauriAvailable && <p>Tauri Version: {platformInfo.osInfo?.version}</p>}
    </div>
  );
}
```

### Available Tauri Commands
```typescript
// Greeting command
const message = await invoke('greet', { name: 'User' });

// Platform information
const platformInfo = await invoke('get_platform_info');

// Conversation management
await invoke('save_conversation', { 
  conversation_id: 'chat-123', 
  content: 'Hello world' 
});

const conversations = await invoke('load_conversations');

// Window controls
await invoke('toggle_window_visibility');
```

## Security Configuration

### Allowlist (Principle of Least Privilege)
The Tauri configuration uses a restrictive allowlist:

```json
{
  "allowlist": {
    "all": false,  // Deny by default
    "window": { "close": true, "hide": true, "show": true /* ... */ },
    "shell": { "open": true },
    "dialog": { "ask": true, "confirm": true /* ... */ },
    "notification": { "all": true },
    "globalShortcut": { "all": true },
    "clipboard": { "readText": true, "writeText": true },
    "fs": { 
      "scope": ["$APPDATA/*", "$DOWNLOAD/*", "$DOCUMENT/*"] 
    },
    "http": { 
      "scope": ["https://*", "http://localhost:*"] 
    }
  }
}
```

### Content Security Policy
```
default-src 'self'; 
script-src 'self' 'unsafe-inline' 'unsafe-eval'; 
style-src 'self' 'unsafe-inline'; 
img-src 'self' data: https:; 
font-src 'self' data:; 
connect-src 'self' https: wss:;
```

## Migration Strategy

### Phase 1: Foundation (Current)
- Tauri runs alongside Electron
- React components detect platform automatically
- Gradual feature testing with Tauri
- Preserve all existing Electron functionality

### Phase 2: Feature Parity
- Migrate all Electron IPC to Tauri commands
- Implement system integrations (global shortcuts, tray)
- Port file system operations to Tauri's secure API
- Adapt state persistence for Tauri

### Phase 3: Optimization
- Remove Electron dependencies
- Optimize Rust backend performance
- Implement Tauri-specific features (plugins)
- Bundle size optimization

### Phase 4: Production
- Complete Electron removal
- Production deployment configuration
- Performance monitoring and optimization
- User migration guides

## Key Differences: Electron vs Tauri

| Feature | Electron | Tauri |
|---------|----------|-------|
| **Bundle Size** | 100-200MB | 2.5-10MB |
| **Memory Usage** | 80-150MB | <40MB |
| **Startup Time** | 2-3 seconds | <500ms |
| **Security** | Node.js access | Capability-based |
| **Backend Language** | JavaScript/Node.js | Rust |
| **Renderer** | Bundled Chromium | System WebView |
| **Auto-updates** | electron-updater | Tauri updater |
| **System Integration** | Native modules | Rust plugins |

## Development Tips

### 1. Platform-Specific Code
```typescript
const { platformInfo } = useTauri();

if (platformInfo.isTauri) {
  // Tauri-specific implementation
} else if (platformInfo.isElectron) {
  // Electron fallback
} else {
  // Web fallback
}
```

### 2. Error Handling
```typescript
try {
  const result = await invoke('tauri_command', args);
} catch (error) {
  console.error('Tauri command failed:', error);
  // Fallback logic
}
```

### 3. State Management
Redux Toolkit state management is preserved. The persistence layer may need updates for Tauri's file system API.

### 4. Testing
```bash
# Test React components in browser
npm start

# Test Tauri integration
npm run tauri:dev

# Test Electron (legacy)
npm run start:dev
```

## Troubleshooting

### Common Issues

1. **Tauri CLI not found**
   ```bash
   npm install -g @tauri-apps/cli
   ```

2. **Rust not installed**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

3. **Build failures**
   ```bash
   npm run tauri:info  # Check system requirements
   ```

4. **Window not showing**
   - Check `tauri.conf.json` window configuration
   - Verify allowlist permissions

### Debug Commands
```bash
# System information
npm run tauri:info

# Development with detailed logs
RUST_LOG=debug npm run tauri:dev

# Build with verbose output
npm run tauri:build -- --verbose
```

## Next Steps

1. **Immediate**: Test the current foundation with `npm run tauri:dev`
2. **Short-term**: Implement Sub-task 2 (Rust API backend)
3. **Medium-term**: Complete remaining sub-tasks (database, cloud, Docker, CI/CD)
4. **Long-term**: Full migration and Electron removal

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tauri API Reference](https://tauri.app/v1/api/js/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Migration Best Practices](https://tauri.app/v1/guides/getting-started/setup/)

---

This migration represents a significant architectural improvement, offering better performance, security, and maintainability while preserving the existing React-based user interface and development workflow.