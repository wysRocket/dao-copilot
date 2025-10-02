# MCP Servers Display - UI Feature Documentation

## Overview
This feature adds a new section to the Settings page that displays all configured MCP (Model Context Protocol) servers from both `.cursor/mcp.json` and `.windsurf/mcp.json` configuration files.

## UI Layout

The MCP Servers section appears in the Settings page with the following structure:

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                                    │
│  Configure your assistant preferences                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [... existing settings sections ...]                        │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ MCP Servers                            [Refresh]      │  │
│  │ Configured MCP servers from .cursor/mcp.json and      │  │
│  │ .windsurf/mcp.json                                    │  │
│  │                                                        │  │
│  │ ┌────────────────────────────────────────────────┐   │  │
│  │ │ task-master-ai                    [Cursor]     │   │  │
│  │ │                                                 │   │  │
│  │ │ Command                                         │   │  │
│  │ │ npx                                            │   │  │
│  │ │                                                 │   │  │
│  │ │ Arguments                                       │   │  │
│  │ │ [-y] [--package=task-master-ai] [task-master-ai]│   │  │
│  │ └────────────────────────────────────────────────┘   │  │
│  │                                                        │  │
│  │ ┌────────────────────────────────────────────────┐   │  │
│  │ │ task-master-ai                  [Windsurf]     │   │  │
│  │ │                                                 │   │  │
│  │ │ Command                                         │   │  │
│  │ │ npx                                            │   │  │
│  │ │                                                 │   │  │
│  │ │ Arguments                                       │   │  │
│  │ │ [-y] [--package=task-master-ai] [task-master-ai]│   │  │
│  │ └────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  [Save Settings]                                             │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. MCP Servers Section
- **Location**: Settings page, after the Window Settings section
- **Style**: Consistent glass morphism design matching existing UI
- **Header**: "MCP Servers" with a Refresh button
- **Description**: Shows that configurations are read from both `.cursor/mcp.json` and `.windsurf/mcp.json`

### 2. Server Cards
Each MCP server is displayed in its own card with:
- **Server Name**: Displayed as a heading (e.g., "task-master-ai")
- **Source Badge**: Color-coded badge indicating the source
  - Blue (#60A5FA) for Cursor
  - Green (#34D399) for Windsurf
- **Command**: The executable command
- **Arguments**: List of command-line arguments displayed as small pills

### 3. States

#### Loading State
```
┌───────────────────────────────────────┐
│ MCP Servers                           │
│ Loading MCP server configurations...  │
└───────────────────────────────────────┘
```

#### Error State
```
┌───────────────────────────────────────┐
│ MCP Servers                           │
│                                       │
│ ┌─────────────────────────────────┐ │
│ │ ⚠️ Error loading MCP servers    │ │
│ │ [Error message here]            │ │
│ └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

#### Empty State
```
┌───────────────────────────────────────┐
│ MCP Servers                 [Refresh] │
│ Configured MCP servers from...        │
│                                       │
│ ┌─────────────────────────────────┐ │
│ │ No MCP servers configured       │ │
│ │ Add MCP server configurations   │ │
│ │ to .cursor/mcp.json or          │ │
│ │ .windsurf/mcp.json              │ │
│ └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

## Technical Implementation

### IPC Architecture
```
┌──────────────────┐          ┌───────────────────┐
│  Renderer        │          │   Main Process    │
│  (React UI)      │          │   (Node.js)       │
│                  │          │                   │
│  MCPServersSection│◄────────►│  MCP Listeners   │
│  Component       │   IPC    │                   │
│                  │          │  • Read configs   │
│  window.mcpAPI   │          │  • Parse JSON     │
│  .getServers()   │          │  • Return data    │
└──────────────────┘          └───────────────────┘
         │                             │
         │                             │
         ▼                             ▼
   MCPServerCard                File System
   Components                   .cursor/mcp.json
                               .windsurf/mcp.json
```

### Files Modified/Added

#### New Files:
1. `src/helpers/ipc/mcp/mcp-channels.ts` - IPC channel definitions
2. `src/helpers/ipc/mcp/mcp-listeners.ts` - Main process IPC handlers
3. `src/helpers/ipc/mcp/mcp-context.ts` - Renderer process API exposure
4. `src/components/MCPServerCard.tsx` - Individual server card component
5. `src/components/MCPServersSection.tsx` - Container component

#### Modified Files:
1. `src/helpers/ipc/listeners-register.ts` - Register MCP listeners
2. `src/helpers/ipc/context-exposer.ts` - Expose MCP API to renderer
3. `src/types.d.ts` - Add TypeScript definitions
4. `src/pages/assistant/SettingsPage.tsx` - Integrate MCP section

## Usage

1. Open the application
2. Navigate to Settings (via sidebar or menu)
3. Scroll to the bottom to find the "MCP Servers" section
4. View all configured MCP servers from both Cursor and Windsurf
5. Click "Refresh" to reload the configuration if changes were made

## Testing Results

✅ **MCP Configuration Reading Test**: PASSED
- Successfully reads `.cursor/mcp.json`
- Successfully reads `.windsurf/mcp.json`
- Correctly parses server configurations
- Handles missing files gracefully
- Found 2 MCP servers (1 from each config file)

## Design Principles

1. **Minimal Changes**: Only added new files and minimal modifications to existing files
2. **Consistent Styling**: Uses the same glass morphism patterns as existing Settings sections
3. **Non-intrusive**: Added as a new section without modifying existing functionality
4. **Informative**: Shows all relevant information about each MCP server
5. **User-friendly**: Clear visual distinction between Cursor and Windsurf configurations

## Future Enhancements (Optional)

- Add status indicators (connected/disconnected)
- Allow enabling/disabling individual servers
- Add connection testing
- Show environment variables (with sensitive data masked)
- Add server management (add/edit/remove)
