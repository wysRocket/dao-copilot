/**
 * Tool-Enabled Gemini Live WebSocket Client Extension
 * 
 * This module extends the existing Gemini Live WebSocket client to support
 * tool calling functionality by enhancing the setup message and message handling.
 */

import GeminiLiveWebSocketClient, { 
  type GeminiLiveConfig, 
  type SetupMessage,
  ResponseModality 
} from './gemini-live-websocket.js';
import { logger } from './gemini-logger.js';

// Enhanced configuration with tool support
export interface ToolEnabledGeminiLiveConfig extends GeminiLiveConfig {
  tools?: Array<{
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  }>;
}

/**
 * Tool-enabled Gemini Live WebSocket Client
 * 
 * Extends the base client to support tool definitions in setup messages
 * and handle tool call requests/responses
 */
export class ToolEnabledGeminiLiveWebSocketClient extends GeminiLiveWebSocketClient {
  private toolsConfig: ToolEnabledGeminiLiveConfig['tools'];

  constructor(config: ToolEnabledGeminiLiveConfig) {
    super(config);
    this.toolsConfig = config.tools;
    
    if (this.toolsConfig && this.toolsConfig.length > 0) {
      logger.info('Tool-enabled Gemini Live client initialized', { 
        toolCount: this.toolsConfig.length,
        tools: this.toolsConfig.map(t => t.name)
      });
    }
  }

  /**
   * Override the createSetupMessage method to include tools
   */
  protected createSetupMessage(): SetupMessage {
    // Get the base setup message from parent class
    const setupMessage = super.createSetupMessage();

    // Add tools configuration if available
    if (this.toolsConfig && this.toolsConfig.length > 0) {
      setupMessage.setup.tools = this.formatToolsForGeminiAPI(this.toolsConfig);
      
      logger.info('Added tools to setup message', { 
        toolCount: this.toolsConfig.length,
        toolNames: this.toolsConfig.map(t => t.name)
      });
    }

    return setupMessage;
  }

  /**
   * Format tool definitions for Gemini Live API
   */
  private formatToolsForGeminiAPI(tools: NonNullable<ToolEnabledGeminiLiveConfig['tools']>): Array<object> {
    return tools.map(tool => ({
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }]
    }));
  }

  /**
   * Send a tool call response back to Gemini API
   */
  async sendToolCallResponse(toolCallId: string, functionName: string, result: any): Promise<void> {
    const responseMessage = {
      clientContent: {
        role: 'function',
        parts: [{
          functionResponse: {
            name: functionName,
            response: result
          }
        }]
      }
    };

    try {
      logger.info('Sending tool call response', { toolCallId, functionName });
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(responseMessage));
        this.emit('toolResponseSent', { toolCallId, functionName, result });
      } else {
        throw new Error('WebSocket not connected');
      }
      
    } catch (error) {
      logger.error('Failed to send tool call response', { 
        error: error instanceof Error ? error.message : String(error),
        toolCallId,
        functionName 
      });
      throw error;
    }
  }

  /**
   * Get configured tool definitions
   */
  getToolDefinitions(): Array<{ name: string; description: string; parameters: any }> | undefined {
    return this.toolsConfig;
  }
}

export default ToolEnabledGeminiLiveWebSocketClient;