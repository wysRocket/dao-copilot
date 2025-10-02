import {contextBridge, ipcRenderer} from 'electron'
import {MCP_GET_SERVERS_CHANNEL} from './mcp-channels'
import type {MCPServersResponse} from './mcp-listeners'

export function exposeMCPAPI(): void {
  contextBridge.exposeInMainWorld('mcpAPI', {
    getServers: (): Promise<MCPServersResponse> => ipcRenderer.invoke(MCP_GET_SERVERS_CHANNEL)
  })
}
