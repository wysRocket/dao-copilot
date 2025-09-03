#!/usr/bin/env node

/**
 * Complete AI Answering Machine with Gemini Live API Tool Calling
 * 
 * This example demonstrates the full integration of the AI answering machine
 * with Gemini Live API tool calling capabilities for Google Search.
 */

import { GeminiToolCallIntegrationService, type GeminiToolCallIntegrationConfig } from '../src/services/gemini-tool-call-integration.js';
import { ResponseModality } from '../src/services/gemini-live-websocket.js';
import * as fs from 'fs';
import * as path from 'path';

class AIAnsweringMachineWithToolCalls {
  private integrationService: GeminiToolCallIntegrationService;
  private conversationLog: Array<{ timestamp: string; type: string; content: string; metadata?: any }> = [];

  constructor() {
    this.loadEnvironment();
    this.initializeIntegrationService();
    this.setupEventHandlers();
  }

  private loadEnvironment(): void {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const envLines = envContent.split('\n');
      
      for (const line of envLines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }

  private initializeIntegrationService(): void {
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!geminiApiKey || !googleSearchApiKey || !searchEngineId) {
      throw new Error(`
Missing required API credentials:
- GEMINI_API_KEY or GOOGLE_API_KEY: ${geminiApiKey ? '✓' : '✗'}
- GOOGLE_SEARCH_API_KEY: ${googleSearchApiKey ? '✓' : '✗'}
- GOOGLE_SEARCH_ENGINE_ID: ${searchEngineId ? '✓' : '✗'}

Please set these environment variables in your .env file.
      `);
    }

    const config: GeminiToolCallIntegrationConfig = {
      gemini: {
        apiKey: geminiApiKey,
        model: 'gemini-live-2.5-flash-preview',
        responseModalities: [ResponseModality.TEXT],
        systemInstruction: `You are an intelligent AI assistant with real-time search capabilities. 
Your role is to provide accurate, helpful, and current information by utilizing Google Search when needed.

Key behaviors:
- Use search for questions requiring current information, facts, or research
- Provide comprehensive yet concise answers
- Always cite sources when using search results
- Maintain a friendly, conversational tone
- Be honest about limitations and search failures`
      },
      googleSearch: {
        apiKey: googleSearchApiKey,
        searchEngineId: searchEngineId,
        enableCaching: true,
        cacheTtlSeconds: 1800, // 30 minutes
        maxResultsPerQuery: 8,
        timeout: 12000
      },
      questionDetection: {
        enabled: true,
        minConfidence: 0.7,
        bufferTimeMs: 1500,
        enableContextProcessing: true,
        conversationHistoryLimit: 25
      },
      toolCalling: {
        autoExecute: true,
        maxConcurrentCalls: 2,
        callTimeout: 15000,
        retryFailedCalls: true,
        maxRetries: 2
      }
    };

    this.integrationService = new GeminiToolCallIntegrationService(config);
  }

  private setupEventHandlers(): void {
    // Connection events
    this.integrationService.on('connected', () => {
      console.log('🚀 Connected to Gemini Live API with tool calling support');
      this.logEvent('system', 'Connected to Gemini Live API', { hasToolCalling: true });
    });

    this.integrationService.on('disconnected', () => {
      console.log('📴 Disconnected from Gemini Live API');
      this.logEvent('system', 'Disconnected from Gemini Live API');
    });

    this.integrationService.on('error', (error) => {
      console.error('❌ Integration service error:', error.message);
      this.logEvent('error', error.message, { error: error.name });
    });

    // Transcription events
    this.integrationService.on('transcription', (data) => {
      if (data.isFinal) {
        console.log(`🎤 Transcription: "${data.text}" (confidence: ${(data.confidence * 100).toFixed(1)}%)`);
        this.logEvent('user_input', data.text, { confidence: data.confidence, source: 'transcription' });
      }
    });

    // Question detection events
    this.integrationService.on('questionDetected', (data) => {
      console.log(`❓ Question detected: "${data.text}"`);
      console.log(`   Type: ${data.questionType}, Confidence: ${(data.confidence * 100).toFixed(1)}%`);
      if (data.isMultiPart) {
        console.log(`   🔗 Multi-part question detected`);
      }
      
      this.logEvent('question_detected', data.text, { 
        questionType: data.questionType, 
        confidence: data.confidence,
        isMultiPart: data.isMultiPart
      });
    });

    // Tool call events
    this.integrationService.on('toolCallRequested', (data) => {
      console.log(`🔧 Tool call requested: ${data.name}`);
      console.log(`   Parameters:`, JSON.stringify(data.parameters, null, 2));
      this.logEvent('tool_call_requested', `${data.name} called`, { parameters: data.parameters });
    });

    this.integrationService.on('toolCallStarted', (data) => {
      console.log(`⚙️  Executing tool: ${data.name}...`);
    });

    this.integrationService.on('toolCallCompleted', (data) => {
      const status = data.success ? '✅' : '❌';
      console.log(`${status} Tool call completed: ${data.name} (${data.executionTime}ms)`);
      
      if (!data.success) {
        console.log(`   Error: ${data.error}`);
      } else if (data.name === 'google_search' && data.result) {
        console.log(`   Found ${data.result.totalResults} search results`);
      }
      
      this.logEvent('tool_call_completed', `${data.name} ${data.success ? 'succeeded' : 'failed'}`, {
        success: data.success,
        executionTime: data.executionTime,
        error: data.error
      });
    });

    // Search events
    this.integrationService.on('searchStarted', (data) => {
      console.log(`🔍 Searching: "${data.query}"`);
    });

    this.integrationService.on('searchCompleted', (data) => {
      console.log(`🔍✅ Search completed: "${data.query}" - ${data.resultCount} results in ${data.responseTime}ms`);
      if (data.cacheHit) {
        console.log(`   ⚡ Cache hit - results served from cache`);
      }
    });

    this.integrationService.on('searchFailed', (data) => {
      console.log(`🔍❌ Search failed: "${data.query}" - ${data.error}`);
    });

    // Response events
    this.integrationService.on('response', (data) => {
      console.log(`\n🤖 Gemini Response:`);
      console.log(`${data.text}\n`);
      console.log(`${'='.repeat(80)}\n`);
      
      this.logEvent('assistant_response', data.text, { 
        source: data.source, 
        timestamp: data.timestamp 
      });
    });

    this.integrationService.on('audioResponse', (data) => {
      console.log(`🔊 Audio response received (${data.audioData.length} bytes)`);
      this.logEvent('audio_response', 'Audio data received', { 
        audioDataLength: data.audioData.length 
      });
    });
  }

  private logEvent(type: string, content: string, metadata?: any): void {
    const timestamp = new Date().toISOString();
    this.conversationLog.push({ timestamp, type, content, metadata });
  }

  public async start(): Promise<void> {
    console.log('🤖 AI Answering Machine with Tool Calling Demo');
    console.log('===============================================\n');

    try {
      // Connect to Gemini Live API
      await this.integrationService.connect();
      
      // Show initial status
      this.showStatus();
      
      // Run demo scenarios
      await this.runDemoScenarios();
      
    } catch (error) {
      console.error('Failed to start AI answering machine:', error);
      throw error;
    }
  }

  private showStatus(): void {
    const connectionState = this.integrationService.getConnectionState();
    const stats = this.integrationService.getStatistics();
    
    console.log(`📊 Status:`);
    console.log(`   Connection: ${connectionState}`);
    console.log(`   Quota: ${stats.quota.used}/${stats.quota.limit} queries used (${stats.quota.usagePercent.toFixed(1)}%)`);
    console.log(`   Cache: ${stats.cache.hits} hits, ${stats.cache.misses} misses`);
    console.log('');
  }

  private async runDemoScenarios(): Promise<void> {
    const scenarios = [
      {
        name: 'Current Events Question',
        input: 'What are the latest developments in artificial intelligence?',
        description: 'Tests search for current information'
      },
      {
        name: 'Factual Information',
        input: 'What is the population of Tokyo?',
        description: 'Tests search for specific facts'
      },
      {
        name: 'Complex Multi-part Question',
        input: 'What is machine learning and what are its main applications in healthcare?',
        description: 'Tests multi-part question processing and search'
      },
      {
        name: 'Technical Question',
        input: 'How do large language models work?',
        description: 'Tests search for technical explanations'
      },
      {
        name: 'General Knowledge (No Search Needed)',
        input: 'What is 25 multiplied by 4?',
        description: 'Tests questions that shouldn\'t trigger search'
      },
      {
        name: 'Creative Request (No Search Needed)',
        input: 'Write a short poem about coding',
        description: 'Tests creative requests that shouldn\'t use tools'
      }
    ];

    console.log(`🧪 Running ${scenarios.length} demo scenarios...\n`);

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      
      console.log(`${'='.repeat(80)}`);
      console.log(`📝 Scenario ${i + 1}/${scenarios.length}: ${scenario.name}`);
      console.log(`Description: ${scenario.description}`);
      console.log(`Input: "${scenario.input}"`);
      console.log(`${'='.repeat(80)}\n`);

      try {
        // Process as transcription to trigger question detection
        await this.integrationService.processTranscription({
          transcript: scenario.input,
          isFinal: true,
          confidence: 0.95
        });

        // Wait for processing to complete
        await this.waitForProcessing(10000); // 10 second timeout

        console.log(`\n⏱️  Scenario completed. Waiting 3 seconds before next scenario...\n`);
        await this.sleep(3000);

      } catch (error) {
        console.error(`❌ Scenario ${i + 1} failed:`, error);
        await this.sleep(1000);
      }
    }

    // Final status
    console.log(`${'='.repeat(80)}`);
    console.log(`📈 Final Demo Statistics:`);
    this.showStatus();
    
    const finalStats = this.integrationService.getStatistics();
    console.log(`   Conversation entries: ${finalStats.conversationHistory}`);
    console.log(`   Tool call history: ${finalStats.toolCallHistory}`);
    console.log(`   Active tool calls: ${finalStats.activeToolCalls}`);
    console.log(`\n🎉 Demo completed successfully!`);
  }

  private async waitForProcessing(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const activeToolCalls = this.integrationService.getActiveToolCalls();
        const elapsed = Date.now() - startTime;
        
        // If no active tool calls and some time has passed, consider it complete
        if (activeToolCalls.length === 0 && elapsed > 2000) {
          clearInterval(checkInterval);
          resolve();
        }
        
        // Timeout
        if (elapsed > timeoutMs) {
          clearInterval(checkInterval);
          console.log(`⏱️  Processing timeout after ${timeoutMs}ms`);
          resolve();
        }
      }, 500);
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async stop(): Promise<void> {
    console.log('\n🛑 Stopping AI answering machine...');
    
    try {
      await this.integrationService.disconnect();
      console.log('📴 Disconnected successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  public saveConversationLog(filePath?: string): void {
    const logPath = filePath || path.join(process.cwd(), 'conversation-log.json');
    
    try {
      fs.writeFileSync(logPath, JSON.stringify(this.conversationLog, null, 2));
      console.log(`💾 Conversation log saved to: ${logPath}`);
    } catch (error) {
      console.error('Failed to save conversation log:', error);
    }
  }

  public destroy(): void {
    if (this.integrationService) {
      this.integrationService.destroy();
    }
  }
}

// Self-executing demo
async function main(): Promise<void> {
  let aiAnsweringMachine: AIAnsweringMachineWithToolCalls | null = null;
  
  try {
    aiAnsweringMachine = new AIAnsweringMachineWithToolCalls();
    
    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n🔄 Graceful shutdown initiated...');
      if (aiAnsweringMachine) {
        await aiAnsweringMachine.stop();
        aiAnsweringMachine.saveConversationLog();
        aiAnsweringMachine.destroy();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the demo
    await aiAnsweringMachine.start();
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    
    if (error instanceof Error && error.message.includes('Missing required API credentials')) {
      console.log('\n🔧 Setup Required:');
      console.log('1. Ensure you have completed Google Search API setup');
      console.log('2. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in your .env file');
      console.log('3. Set GOOGLE_SEARCH_API_KEY in your .env file');
      console.log('4. Set GOOGLE_SEARCH_ENGINE_ID in your .env file');
      console.log('5. Run this demo again');
    }
    
    process.exit(1);
    
  } finally {
    if (aiAnsweringMachine) {
      aiAnsweringMachine.destroy();
    }
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default AIAnsweringMachineWithToolCalls;