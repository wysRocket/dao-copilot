import {ipcMain} from 'electron'
import {promises as fs} from 'fs'
import * as path from 'path'
import {MCP_GET_SERVERS_CHANNEL} from './mcp-channels'

export interface MCPServer {
  name: string
  command: string
  args: string[]
  source: 'cursor' | 'windsurf'
}

export interface MCPServersResponse {
  servers: MCPServer[]
  error?: string
}

async function readMCPConfig(configPath: string, source: 'cursor' | 'windsurf'): Promise<MCPServer[]> {
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(data)
    
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      return Object.entries(config.mcpServers).map(([name, serverConfig]: [string, unknown]) => ({
        name,
        command: (serverConfig as {command?: string}).command || '',
        args: (serverConfig as {args?: string[]}).args || [],
        source
      }))
    }
    
    return []
  } catch {
    // File doesn't exist or is invalid - this is not an error, just means no config
    return []
  }
}

export function registerMCPListeners(): void {
  ipcMain.handle(MCP_GET_SERVERS_CHANNEL, async (): Promise<MCPServersResponse> => {
    try {
      const projectRoot = process.cwd()
      
      // Read both .cursor/mcp.json and .windsurf/mcp.json
      const [cursorServers, windsurfServers] = await Promise.all([
        readMCPConfig(path.join(projectRoot, '.cursor', 'mcp.json'), 'cursor'),
        readMCPConfig(path.join(projectRoot, '.windsurf', 'mcp.json'), 'windsurf')
      ])
      
      const allServers = [...cursorServers, ...windsurfServers]
      
      return {
        servers: allServers
      }
    } catch (error) {
      console.error('Error reading MCP configurations:', error)
      return {
        servers: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })
}
