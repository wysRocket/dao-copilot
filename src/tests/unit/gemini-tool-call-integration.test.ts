/**
 * Test Suite for Gemini Tool Call Integration
 *
 * Comprehensive testing of the Gemini Live API tool calling functionality
 * including Google Search integration and question detection.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {vi, describe, beforeEach, afterEach, it, expect} from 'vitest'
import {EventEmitter} from 'events'
import GeminiToolCallIntegrationService, {
  type GeminiToolCallIntegrationConfig,
  type GeminiToolCallIntegrationEvents
} from '../../services/gemini-tool-call-integration'
import {ResponseModality, ConnectionState} from '../../services/gemini-live-websocket'

// Mock dependencies
vi.mock('../../services/tool-enabled-gemini-websocket')
vi.mock('../../services/tool-call-handler')
vi.mock('../../services/question-detector')
vi.mock('../../services/transcription-question-pipeline')
vi.mock('../../services/multi-part-question-processor')
vi.mock('../../services/gemini-logger')

const jest = vi

describe('GeminiToolCallIntegrationService', () => {
  let integrationService: GeminiToolCallIntegrationService
  let mockConfig: GeminiToolCallIntegrationConfig

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Create test configuration
    mockConfig = {
      gemini: {
        apiKey: 'test-gemini-api-key',
        model: 'gemini-live-2.5-flash-preview',
        systemInstruction: 'Test system instruction',
        responseModalities: [ResponseModality.TEXT]
      },
      googleSearch: {
        apiKey: 'test-search-api-key',
        searchEngineId: 'test-search-engine-id',
        enableCaching: true,
        cacheTtlSeconds: 1800,
        maxResultsPerQuery: 10,
        timeout: 10000
      },
      questionDetection: {
        enabled: true,
        minConfidence: 0.7,
        bufferTimeMs: 1500,
        enableContextProcessing: true,
        conversationHistoryLimit: 20
      },
      toolCalling: {
        autoExecute: true,
        maxConcurrentCalls: 3,
        callTimeout: 30000,
        retryFailedCalls: true,
        maxRetries: 2
      }
    }

    integrationService = new GeminiToolCallIntegrationService(mockConfig)
  })

  afterEach(() => {
    if (integrationService) {
      integrationService.destroy()
    }
  })

  describe('Service Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(integrationService).toBeInstanceOf(GeminiToolCallIntegrationService)
      expect(integrationService).toBeInstanceOf(EventEmitter)
    })

    it('should create tool definitions correctly', () => {
      // Access private method through type assertion for testing
      const toolDefinitions = (integrationService as any).createToolDefinitions()

      expect(toolDefinitions).toHaveLength(1)
      expect(toolDefinitions[0]).toMatchObject({
        name: 'google_search',
        description: expect.stringContaining('Search the web'),
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: expect.stringContaining('search query')
            },
            num_results: {
              type: 'number',
              description: expect.stringContaining('Number of search results')
            }
          },
          required: ['query']
        }
      })
    })

    it('should create comprehensive system instruction', () => {
      const systemInstruction = (integrationService as any).createSystemInstruction()

      expect(systemInstruction).toContain('Test system instruction')
      expect(systemInstruction).toContain('TOOL USAGE GUIDELINES')
      expect(systemInstruction).toContain('google_search')
      expect(systemInstruction).toContain('When to Search')
      expect(systemInstruction).toContain('When NOT to Search')
    })
  })

  describe('Connection Management', () => {
    it('should connect to Gemini Live API', async () => {
      const connectPromise = integrationService.connect()

      // Simulate successful connection
      integrationService.emit('connected')

      await expect(connectPromise).resolves.toBeUndefined()
    })

    it('should disconnect from Gemini Live API', async () => {
      const disconnectPromise = integrationService.disconnect()

      // Simulate successful disconnection
      integrationService.emit('disconnected')

      await expect(disconnectPromise).resolves.toBeUndefined()
    })

    it('should emit connection events', async () => {
      await new Promise<void>(resolve => {
        integrationService.on('connected', () => {
          expect(true).toBe(true)
          resolve()
        })

        integrationService.emit('connected')
      })
    })
  })

  describe('Question Detection and Processing', () => {
    it('should process transcription input', async () => {
      const transcriptionData = {
        transcript: 'What is the capital of France?',
        isFinal: true,
        confidence: 0.95
      }

      const transcriptionSpy = jest.fn()
      integrationService.on('transcription', transcriptionSpy)

      await integrationService.processTranscription(transcriptionData)

      expect(transcriptionSpy).toHaveBeenCalledWith({
        text: transcriptionData.transcript,
        confidence: transcriptionData.confidence,
        isFinal: transcriptionData.isFinal
      })
    })

    it('should detect questions in transcription', async () => {
      const questionEvent = {
        text: 'What is the weather in New York?',
        questionType: 'factual',
        confidence: 0.85
      }

      const questionSpy = jest.fn()
      integrationService.on('questionDetected', questionSpy)

      // Simulate question detection event
      await (integrationService as any).handleQuestionDetected(questionEvent)

      expect(questionSpy).toHaveBeenCalledWith({
        text: questionEvent.text,
        questionType: questionEvent.questionType,
        confidence: questionEvent.confidence,
        isMultiPart: false // Assuming not multi-part for this test
      })
    })

    it('should handle multi-part questions', async () => {
      const multiPartQuestion = {
        text: 'What is artificial intelligence and how does it work?',
        questionType: 'complex',
        confidence: 0.9
      }

      const questionSpy = jest.fn()
      integrationService.on('questionDetected', questionSpy)

      // Mock multi-part processor to return multi-part result
      const mockMultiPartResult = {
        isMultiPart: true,
        processingStrategy: 'sequential',
        parts: [
          {id: 1, question: 'What is artificial intelligence?', dependencies: []},
          {id: 2, question: 'How does artificial intelligence work?', dependencies: [1]}
        ]
      }

      // Mock the multi-part processor
      ;(integrationService as any).multiPartProcessor = {
        processQuestion: jest.fn().mockResolvedValue(mockMultiPartResult)
      }

      await (integrationService as any).handleQuestionDetected(multiPartQuestion)

      expect(questionSpy).toHaveBeenCalledWith({
        text: multiPartQuestion.text,
        questionType: multiPartQuestion.questionType,
        confidence: multiPartQuestion.confidence,
        isMultiPart: true
      })
    })
  })

  describe('Tool Call Handling', () => {
    it('should handle tool call requests', async () => {
      const toolCallRequest = {
        id: 'test-tool-call-id',
        name: 'google_search',
        parameters: {query: 'test query', num_results: 5},
        timestamp: Date.now()
      }

      const toolCallSpy = jest.fn()
      integrationService.on('toolCallRequested', toolCallSpy)

      await (integrationService as any).handleToolCallRequest(toolCallRequest)

      expect(toolCallSpy).toHaveBeenCalledWith(toolCallRequest)

      // Check that tool call is tracked
      const activeToolCalls = integrationService.getActiveToolCalls()
      expect(activeToolCalls).toHaveLength(1)
      expect(activeToolCalls[0].id).toBe(toolCallRequest.id)
    })

    it('should execute Google search tool calls', async () => {
      // Mock successful search result
      const mockSearchResult = {
        success: true,
        results: [
          {
            title: 'Test Result 1',
            snippet: 'This is a test result',
            link: 'https://example.com/1'
          },
          {
            title: 'Test Result 2',
            snippet: 'This is another test result',
            link: 'https://example.com/2'
          }
        ],
        metadata: {
          responseTime: 150,
          cacheHit: false
        }
      }

      // Mock tool call handler
      ;(integrationService as any).toolCallHandler = {
        executeGoogleSearch: jest.fn().mockResolvedValue(mockSearchResult)
      }

      // Mock WebSocket client
      ;(integrationService as any).websocketClient = {
        sendToolCallResponse: jest.fn().mockResolvedValue(undefined)
      }

      const toolCallRequest = {
        id: 'test-search-id',
        name: 'google_search',
        parameters: {query: 'test search query', num_results: 5}
      }

      const completedSpy = jest.fn()
      integrationService.on('toolCallCompleted', completedSpy)

      await (integrationService as any).executeToolCall(toolCallRequest)

      expect(completedSpy).toHaveBeenCalledWith({
        id: toolCallRequest.id,
        name: toolCallRequest.name,
        success: true,
        result: expect.objectContaining({
          query: 'test search query',
          results: expect.arrayContaining([
            expect.objectContaining({
              title: 'Test Result 1',
              snippet: 'This is a test result',
              link: 'https://example.com/1'
            })
          ]),
          totalResults: 2
        }),
        error: undefined,
        executionTime: expect.any(Number)
      })
    })

    it('should handle tool call failures', async () => {
      // Mock failed search result
      const mockSearchResult = {
        success: false,
        error: 'API quota exceeded',
        results: null
      }

      // Mock tool call handler
      ;(integrationService as any).toolCallHandler = {
        executeGoogleSearch: jest.fn().mockResolvedValue(mockSearchResult)
      }

      // Mock WebSocket client
      ;(integrationService as any).websocketClient = {
        sendToolCallResponse: jest.fn().mockResolvedValue(undefined)
      }

      const toolCallRequest = {
        id: 'test-failed-search-id',
        name: 'google_search',
        parameters: {query: 'test query'}
      }

      const completedSpy = jest.fn()
      integrationService.on('toolCallCompleted', completedSpy)

      await (integrationService as any).executeToolCall(toolCallRequest)

      expect(completedSpy).toHaveBeenCalledWith({
        id: toolCallRequest.id,
        name: toolCallRequest.name,
        success: false,
        result: expect.objectContaining({
          query: 'test query',
          results: [],
          error: 'API quota exceeded'
        }),
        error: 'API quota exceeded',
        executionTime: expect.any(Number)
      })
    })

    it('should retry failed tool calls when configured', async () => {
      // Mock tool call handler that fails first time, succeeds second time
      const mockToolCallHandler = {
        executeGoogleSearch: jest
          .fn()
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({
            success: true,
            results: [{title: 'Success!', snippet: 'It worked', link: 'https://example.com'}]
          })
      }

      ;(integrationService as any).toolCallHandler = mockToolCallHandler
      ;(integrationService as any).websocketClient = {
        sendToolCallResponse: jest.fn().mockResolvedValue(undefined)
      }

      const toolCallRequest = {
        id: 'test-retry-id',
        name: 'google_search',
        parameters: {query: 'test retry query'}
      }

      // Set up the active tool call for retry tracking
      ;(integrationService as any).activeToolCalls.set(toolCallRequest.id, {
        id: toolCallRequest.id,
        name: toolCallRequest.name,
        parameters: toolCallRequest.parameters,
        startTime: Date.now(),
        retryCount: 0
      })

      const completedSpy = jest.fn()
      integrationService.on('toolCallCompleted', completedSpy)

      // First execution (should fail and retry)
      await (integrationService as any).executeToolCall(toolCallRequest)

      // Wait for retry delay
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(mockToolCallHandler.executeGoogleSearch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Message and Response Handling', () => {
    it('should handle text responses from Gemini', async () => {
      const mockMessage = {
        type: 'text',
        content: 'This is a response from Gemini',
        metadata: {timestamp: Date.now()}
      }

      const responseSpy = jest.fn()
      integrationService.on('response', responseSpy)

      await (integrationService as any).handleGeminiMessage(mockMessage)

      expect(responseSpy).toHaveBeenCalledWith({
        text: mockMessage.content,
        source: 'gemini',
        timestamp: expect.any(Number)
      })

      // Check conversation history
      const history = integrationService.getConversationHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        type: 'model',
        content: mockMessage.content,
        timestamp: expect.any(Number)
      })
    })

    it('should handle audio responses from Gemini', async () => {
      const mockMessage = {
        type: 'audio',
        audioData: 'base64-encoded-audio-data',
        metadata: {timestamp: Date.now()}
      }

      const audioSpy = jest.fn()
      integrationService.on('audioResponse', audioSpy)

      await (integrationService as any).handleGeminiMessage(mockMessage)

      expect(audioSpy).toHaveBeenCalledWith({
        audioData: mockMessage.audioData,
        timestamp: expect.any(Number)
      })
    })

    it('should handle tool call messages from Gemini', async () => {
      const mockMessage = {
        type: 'tool_call',
        toolCall: {
          id: 'gemini-tool-call-id',
          name: 'google_search',
          parameters: {query: 'Gemini requested search', num_results: 8}
        },
        metadata: {timestamp: Date.now()}
      }

      const toolCallSpy = jest.fn()
      integrationService.on('toolCallRequested', toolCallSpy)

      // Mock the handleToolCallRequest method
      ;(integrationService as any).handleToolCallRequest = jest.fn().mockResolvedValue(undefined)

      await (integrationService as any).handleGeminiMessage(mockMessage)

      expect((integrationService as any).handleToolCallRequest).toHaveBeenCalledWith({
        id: mockMessage.toolCall.id,
        name: mockMessage.toolCall.name,
        parameters: mockMessage.toolCall.parameters,
        timestamp: expect.any(Number)
      })
    })
  })

  describe('Search Events', () => {
    it('should emit search events from tool call handler', () => {
      const searchStartSpy = jest.fn()
      const searchCompleteSpy = jest.fn()
      const searchFailedSpy = jest.fn()

      integrationService.on('searchStarted', searchStartSpy)
      integrationService.on('searchCompleted', searchCompleteSpy)
      integrationService.on('searchFailed', searchFailedSpy)

      // Simulate search events from tool call handler
      ;(integrationService as any).toolCallHandler.emit('searchStart', {query: 'test search'})
      ;(integrationService as any).toolCallHandler.emit('searchComplete', {
        query: 'test search',
        resultCount: 5,
        responseTime: 200,
        cacheHit: false
      })
      ;(integrationService as any).toolCallHandler.emit('searchError', {
        query: 'failed search',
        error: 'Network error'
      })

      expect(searchStartSpy).toHaveBeenCalledWith({
        query: 'test search',
        timestamp: expect.any(Number)
      })

      expect(searchCompleteSpy).toHaveBeenCalledWith({
        query: 'test search',
        resultCount: 5,
        responseTime: 200,
        cacheHit: false
      })

      expect(searchFailedSpy).toHaveBeenCalledWith({
        query: 'failed search',
        error: 'Network error',
        timestamp: expect.any(Number)
      })
    })
  })

  describe('Public API Methods', () => {
    it('should send text messages', async () => {
      const mockWebSocketClient = {
        sendRealtimeInput: jest.fn().mockResolvedValue(undefined)
      }
      ;(integrationService as any).websocketClient = mockWebSocketClient

      await integrationService.sendText('Hello, Gemini!')

      expect(mockWebSocketClient.sendRealtimeInput).toHaveBeenCalledWith({
        text: 'Hello, Gemini!'
      })

      // Check conversation history
      const history = integrationService.getConversationHistory()
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        type: 'user',
        content: 'Hello, Gemini!',
        metadata: {source: 'direct_input'}
      })
    })

    it('should send audio messages', async () => {
      const mockWebSocketClient = {
        sendRealtimeInput: jest.fn().mockResolvedValue(undefined)
      }
      ;(integrationService as any).websocketClient = mockWebSocketClient

      const audioData = 'base64-audio-data'
      const mimeType = 'audio/wav'

      await integrationService.sendAudio(audioData, mimeType)

      expect(mockWebSocketClient.sendRealtimeInput).toHaveBeenCalledWith({
        audio: {data: audioData, mimeType}
      })
    })

    it('should return conversation history', () => {
      // Add some test entries to history
      ;(integrationService as any).addToConversationHistory('user', 'Hello')
      ;(integrationService as any).addToConversationHistory('model', 'Hi there!')
      ;(integrationService as any).addToConversationHistory('tool', 'Search results...')

      const history = integrationService.getConversationHistory()
      expect(history).toHaveLength(3)
      expect(history[0].type).toBe('user')
      expect(history[1].type).toBe('model')
      expect(history[2].type).toBe('tool')
    })

    it('should return connection state', () => {
      const mockWebSocketClient = {
        getConnectionState: jest.fn().mockReturnValue(ConnectionState.CONNECTED)
      }
      ;(integrationService as any).websocketClient = mockWebSocketClient

      const state = integrationService.getConnectionState()
      expect(state).toBe(ConnectionState.CONNECTED)
    })

    it('should return statistics', () => {
      // Mock dependencies
      ;(integrationService as any).toolCallHandler = {
        getQuotaStatus: jest.fn().mockReturnValue({used: 10, limit: 100, usagePercent: 10}),
        getCacheStats: jest.fn().mockReturnValue({hits: 5, misses: 3})
      }

      // Add some conversation history
      ;(integrationService as any).addToConversationHistory('user', 'Question')
      ;(integrationService as any).addToConversationHistory('model', 'Answer')
      ;(integrationService as any).addToConversationHistory('tool', 'Search results')

      const stats = integrationService.getStatistics()
      expect(stats).toMatchObject({
        conversationHistory: 3,
        toolCallHistory: 1,
        activeToolCalls: 0,
        quota: {used: 10, limit: 100, usagePercent: 10},
        cache: {hits: 5, misses: 3}
      })
    })
  })

  describe('Service Cleanup', () => {
    it('should cleanup all resources on destroy', () => {
      const mockWebSocketClient = {
        disconnect: jest.fn()
      }
      const mockToolCallHandler = {
        destroy: jest.fn()
      }
      const mockTranscriptionPipeline = {
        destroy: jest.fn()
      }

      ;(integrationService as any).websocketClient = mockWebSocketClient
      ;(integrationService as any).toolCallHandler = mockToolCallHandler
      ;(integrationService as any).transcriptionPipeline = mockTranscriptionPipeline

      // Add some state to clean up
      ;(integrationService as any).addToConversationHistory('user', 'test')
      ;(integrationService as any).activeToolCalls.set('test-id', {id: 'test-id'})

      integrationService.destroy()

      expect(mockWebSocketClient.disconnect).toHaveBeenCalled()
      expect(mockToolCallHandler.destroy).toHaveBeenCalled()
      expect(mockTranscriptionPipeline.destroy).toHaveBeenCalled()

      // Verify cleanup
      expect(integrationService.getConversationHistory()).toHaveLength(0)
      expect(integrationService.getActiveToolCalls()).toHaveLength(0)
    })
  })
})

// Integration test for the complete workflow
describe('Gemini Tool Call Integration - End to End', () => {
  let integrationService: GeminiToolCallIntegrationService

  beforeEach(() => {
    const config: GeminiToolCallIntegrationConfig = {
      gemini: {
        apiKey: 'test-gemini-api-key',
        model: 'gemini-live-2.5-flash-preview'
      },
      googleSearch: {
        apiKey: 'test-search-api-key',
        searchEngineId: 'test-search-engine-id',
        enableCaching: true
      }
    }

    integrationService = new GeminiToolCallIntegrationService(config)
  })

  afterEach(() => {
    integrationService.destroy()
  })

  it('should complete a full question-answer-search workflow', async () => {
    // Mock all the components
    const mockSearchResult = {
      success: true,
      results: [
        {
          title: 'AI Definition',
          snippet: 'Artificial Intelligence...',
          link: 'https://example.com/ai'
        }
      ],
      metadata: {responseTime: 300}
    }

    ;(integrationService as any).toolCallHandler = {
      executeGoogleSearch: jest.fn().mockResolvedValue(mockSearchResult),
      getQuotaStatus: jest.fn().mockReturnValue({used: 1, limit: 100}),
      getCacheStats: jest.fn().mockReturnValue({hits: 0, misses: 1})
    }

    ;(integrationService as any).websocketClient = {
      sendRealtimeInput: jest.fn().mockResolvedValue(undefined),
      sendToolCallResponse: jest.fn().mockResolvedValue(undefined)
    }

    // Set up event tracking
    const events: Array<{event: keyof GeminiToolCallIntegrationEvents; data: unknown}> = []

    integrationService.on('questionDetected', data => {
      events.push({event: 'questionDetected', data})
    })

    integrationService.on('toolCallRequested', data => {
      events.push({event: 'toolCallRequested', data})
    })

    integrationService.on('searchStarted', data => {
      events.push({event: 'searchStarted', data})
    })

    integrationService.on('searchCompleted', data => {
      events.push({event: 'searchCompleted', data})
    })

    integrationService.on('toolCallCompleted', data => {
      events.push({event: 'toolCallCompleted', data})
    })

    // 1. Process transcription (question detection)
    await integrationService.processTranscription({
      transcript: 'What is artificial intelligence?',
      isFinal: true,
      confidence: 0.9
    })

    // 2. Simulate detected question triggering tool call
    const questionEvent = {
      text: 'What is artificial intelligence?',
      questionType: 'factual',
      confidence: 0.9
    }

    await (integrationService as any).handleQuestionDetected(questionEvent)

    // 3. Simulate Gemini requesting tool call
    const toolCallRequest = {
      id: 'ai-search-call',
      name: 'google_search',
      parameters: {query: 'artificial intelligence definition', num_results: 5}
    }

    await (integrationService as any).handleToolCallRequest(toolCallRequest)

    // Verify the complete workflow
    expect(events.some(e => e.event === 'questionDetected')).toBe(true)
    expect(events.some(e => e.event === 'toolCallRequested')).toBe(true)
    expect(events.some(e => e.event === 'toolCallCompleted')).toBe(true)

    // Verify conversation history includes all parts
    const history = integrationService.getConversationHistory()
    expect(history.length).toBeGreaterThan(0)
    expect(history.some(entry => entry.type === 'user')).toBe(true)
  })
})

export default {}
