/**
 * Gemini Live API Advanced Google Search Tool Integration
 *
 * This module provides enhanced Google Search tools that integrate with the Gemini Live API,
 * including intelligent search, page fetching, and AI-powered summarization capabilities.
 * Implements the function calling interface for Gemini Live conversations.
 */

import axios, {AxiosError} from 'axios'
import {EventEmitter} from 'events'
import NodeCache from 'node-cache'
import {GoogleGenAI} from '@google/genai'
import ToolCallHandler, {
  SearchResult,
  SearchOptions,
  ToolCallConfig,
  ToolCallResult
} from './tool-call-handler'
import * as crypto from 'crypto'

// Enhanced interfaces for Gemini Live API integration
export interface GoogleSearchFunction {
  query: string
  country?: string
  language?: string
  max_results?: number
}

export interface FetchPageFunction {
  url: string
  timeout?: number
  include_metadata?: boolean
}

export interface SummarizeResultsFunction {
  items: SearchResult[]
  question: string
  max_length?: number
  focus_areas?: string[]
}

export interface PageContent {
  url: string
  title: string
  content: string
  metadata: {
    contentType: string
    size: number
    encoding: string
    timestamp: number
    responseTime: number
  }
  success: boolean
  error?: string
}

export interface SummaryResult {
  summary: string
  relevantResults: SearchResult[]
  keyPoints: string[]
  citations: string[]
  confidence: number
  metadata: {
    inputCount: number
    processingTime: number
    model: string
    timestamp: number
  }
  success: boolean
  error?: string
}

export interface GeminiSearchConfig extends ToolCallConfig {
  geminiApiKey?: string
  geminiModel?: string
  enableIntelligentSummarization?: boolean
  summaryMaxTokens?: number
  pageContentTimeout?: number
  maxPageSize?: number
  userAgent?: string
}

/**
 * Enhanced Google Search Tools for Gemini Live API
 * Provides function declarations and implementations for Gemini Live conversations
 */
export class GeminiSearchTools extends EventEmitter {
  private toolCallHandler: ToolCallHandler
  private geminiClient: GoogleGenAI
  private config: Required<GeminiSearchConfig>
  private cache: NodeCache

  /**
   * Browser-safe environment variable access
   */
  private getBrowserEnvVar(key: string): string | undefined {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        // For Vite/Create React App with REACT_APP_ prefix
        const reactAppKey = `REACT_APP_${key}`
        if (import.meta?.env?.[reactAppKey]) {
          return import.meta.env[reactAppKey]
        }

        // Check for global environment variables
        const globalEnv = (window as unknown as {__ENV__?: Record<string, string>}).__ENV__
        if (globalEnv && globalEnv[key]) {
          return globalEnv[key]
        }
      }

      // For Node.js environments (development/server-side)
      if (typeof process !== 'undefined' && process.env) {
        return process.env[key]
      }

      return undefined
    } catch (error) {
      console.warn(`Failed to access environment variable ${key}:`, error)
      return undefined
    }
  }

  constructor(config: GeminiSearchConfig) {
    super()

    // Enhanced configuration with Gemini-specific settings
    this.config = {
      ...config,
      geminiApiKey:
        config.geminiApiKey ||
        this.getBrowserEnvVar('GEMINI_API_KEY') ||
        this.getBrowserEnvVar('GOOGLE_API_KEY') ||
        config.apiKey,
      geminiModel: config.geminiModel || 'gemini-2.5-flash',
      enableIntelligentSummarization: config.enableIntelligentSummarization ?? true,
      summaryMaxTokens: config.summaryMaxTokens || 1500,
      pageContentTimeout: config.pageContentTimeout || 10000,
      maxPageSize: config.maxPageSize || 1048576, // 1MB limit
      userAgent: config.userAgent || 'DAO-Copilot-Search/1.0 (Gemini-Live-Integration)',
      // Inherit all ToolCallConfig properties
      baseUrl: config.baseUrl || 'https://www.googleapis.com/customsearch/v1',
      timeout: config.timeout || 10000,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      exponentialBackoff: config.exponentialBackoff ?? true,
      enableCaching: config.enableCaching ?? true,
      cacheTtlSeconds: config.cacheTtlSeconds || 3600,
      maxCacheEntries: config.maxCacheEntries || 1000,
      rateLimit: config.rateLimit || {dailyLimit: 100, intervalMs: 24 * 60 * 60 * 1000},
      security: config.security || {
        sanitizeQueries: true,
        maxQueryLength: 2048,
        allowedDomains: [],
        blockedDomains: []
      }
    } as Required<GeminiSearchConfig>

    // Initialize core components
    this.toolCallHandler = new ToolCallHandler(this.config)
    this.geminiClient = new GoogleGenAI({apiKey: this.config.geminiApiKey})

    // Initialize cache for page content and summaries
    this.cache = new NodeCache({
      stdTTL: this.config.cacheTtlSeconds,
      maxKeys: this.config.maxCacheEntries * 2, // Extra space for page content cache
      useClones: false
    })

    // Forward events from ToolCallHandler
    this.toolCallHandler.on('searchStart', data => this.emit('searchStart', data))
    this.toolCallHandler.on('searchComplete', data => this.emit('searchComplete', data))
    this.toolCallHandler.on('searchError', data => this.emit('searchError', data))
    this.toolCallHandler.on('cacheHit', data => this.emit('cacheHit', data))
    this.toolCallHandler.on('quotaUpdate', data => this.emit('quotaUpdate', data))
    this.toolCallHandler.on('quotaWarning', data => this.emit('quotaWarning', data))
  }

  /**
   * Function Declarations for Gemini Live API
   * These define the tools available to the Gemini model during conversations
   */
  getFunctionDeclarations(): Record<string, unknown>[] {
    return [
      // Google Search Function
      {
        name: 'google_search',
        description:
          'Search the web using Google Custom Search API. Use this to find current information, answer questions, or research topics.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query string. Be specific and use relevant keywords.'
            },
            country: {
              type: 'string',
              description:
                'Country code for geolocation-specific results (e.g., "US", "UK", "DE"). Optional.'
            },
            language: {
              type: 'string',
              description: 'Language code for results (e.g., "en", "es", "fr"). Optional.'
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of search results to return (1-10). Default is 5.'
            }
          },
          required: ['query']
        }
      },

      // Fetch Page Function
      {
        name: 'fetch_page',
        description:
          'Retrieve the full content of a specific web page. Use this to get detailed information from a URL found in search results.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch content from. Must be a valid HTTP/HTTPS URL.'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds for the request. Default is 10000 (10 seconds).'
            },
            include_metadata: {
              type: 'boolean',
              description:
                'Whether to include page metadata (content type, size, etc.). Default is true.'
            }
          },
          required: ['url']
        }
      },

      // Summarize Results Function
      {
        name: 'summarize_results',
        description:
          'Generate an AI-powered summary of search results relevant to a specific question. Use this to synthesize information from multiple sources.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              description: 'Array of search results to summarize',
              items: {
                type: 'object',
                description: 'Search result object with title, snippet, and link'
              }
            },
            question: {
              type: 'string',
              description: 'The specific question or topic to focus the summary on'
            },
            max_length: {
              type: 'number',
              description: 'Maximum length of the summary in words. Default is 300.'
            },
            focus_areas: {
              type: 'array',
              description: 'Specific aspects or areas to focus on in the summary',
              items: {
                type: 'string'
              }
            }
          },
          required: ['items', 'question']
        }
      }
    ]
  }

  /**
   * Execute Google Search - Enhanced version with intelligent query handling
   */
  async google_search(params: GoogleSearchFunction): Promise<ToolCallResult> {
    try {
      this.emit('functionCall', {name: 'google_search', params})

      // Validate parameters
      if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
        throw new Error('Query parameter is required and must be a non-empty string')
      }

      // Prepare search options
      const searchOptions: SearchOptions = {
        num: Math.min(Math.max(params.max_results || 5, 1), 10), // Clamp between 1-10
        gl: params.country, // Geolocation
        hl: params.language, // Interface language
        safe: 'moderate' // Safe search
      }

      // Execute search through ToolCallHandler
      const result = await this.toolCallHandler.executeGoogleSearch(params.query, searchOptions)

      this.emit('functionComplete', {
        name: 'google_search',
        success: result.success,
        resultCount: result.results?.length || 0
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in google_search'
      this.emit('functionError', {name: 'google_search', error: errorMessage})

      return {
        success: false,
        error: errorMessage,
        metadata: {
          query: params.query || '',
          timestamp: Date.now(),
          responseTime: 0,
          cacheHit: false,
          quotaUsed: 0,
          source: 'api' as 'api' | 'cache' | 'fallback'
        }
      }
    }
  }

  /**
   * Fetch Page Content - Enhanced with content parsing and error handling
   */
  async fetch_page(params: FetchPageFunction): Promise<PageContent> {
    const startTime = Date.now()

    try {
      this.emit('functionCall', {name: 'fetch_page', params})

      // Validate URL
      if (!params.url || typeof params.url !== 'string') {
        throw new Error('URL parameter is required and must be a string')
      }

      let url: URL
      try {
        url = new URL(params.url)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('URL must use HTTP or HTTPS protocol')
        }
      } catch {
        throw new Error(`Invalid URL: ${params.url}`)
      }

      // Check cache first
      const cacheKey = crypto.createHash('sha256').update(params.url).digest('hex')
      if (this.config.enableCaching) {
        const cached = this.cache.get<PageContent>(cacheKey)
        if (cached) {
          this.emit('cacheHit', {function: 'fetch_page', url: params.url})
          return cached
        }
      }

      // Check security constraints
      if (this.config.security.blockedDomains.some(domain => url.hostname.includes(domain))) {
        throw new Error(`Domain ${url.hostname} is blocked`)
      }

      if (
        this.config.security.allowedDomains.length > 0 &&
        !this.config.security.allowedDomains.some(domain => url.hostname.includes(domain))
      ) {
        throw new Error(`Domain ${url.hostname} is not in allowed domains list`)
      }

      // Execute HTTP request
      const timeout = params.timeout || this.config.pageContentTimeout
      const response = await axios.get(params.url, {
        timeout,
        maxContentLength: this.config.maxPageSize,
        headers: {
          'User-Agent': this.config.userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          DNT: '1',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        validateStatus: status => status >= 200 && status < 400
      })

      // Extract and clean content
      let content = response.data
      let title = params.url

      // Basic HTML parsing for title extraction
      if (response.headers['content-type']?.includes('text/html')) {
        const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i)
        if (titleMatch) {
          title = titleMatch[1].trim()
        }

        // Remove HTML tags for cleaner content (basic cleaning)
        content = content
          .replace(/<script[^>]*>.*?<\/script>/gis, '')
          .replace(/<style[^>]*>.*?<\/style>/gis, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      const responseTime = Date.now() - startTime

      const result: PageContent = {
        url: params.url,
        title,
        content,
        metadata: {
          contentType: response.headers['content-type'] || 'unknown',
          size: content.length,
          encoding: response.headers['content-encoding'] || 'none',
          timestamp: Date.now(),
          responseTime
        },
        success: true
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, result)
      }

      this.emit('functionComplete', {
        name: 'fetch_page',
        success: true,
        url: params.url,
        contentSize: content.length,
        responseTime
      })

      return result
    } catch (error) {
      const responseTime = Date.now() - startTime
      let errorMessage = 'Unknown error occurred'

      if (error instanceof AxiosError) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'Request timeout'
        } else if (error.response) {
          errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Website not found'
        } else {
          errorMessage = error.message
        }
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      this.emit('functionError', {name: 'fetch_page', error: errorMessage, url: params.url})

      return {
        url: params.url,
        title: '',
        content: '',
        metadata: {
          contentType: 'error',
          size: 0,
          encoding: 'none',
          timestamp: Date.now(),
          responseTime
        },
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Summarize Search Results - AI-powered analysis using Gemini
   */
  async summarize_results(params: SummarizeResultsFunction): Promise<SummaryResult> {
    const startTime = Date.now()

    try {
      this.emit('functionCall', {name: 'summarize_results', params})

      // Validate parameters
      if (!params.items || !Array.isArray(params.items) || params.items.length === 0) {
        throw new Error('Items parameter is required and must be a non-empty array')
      }

      if (!params.question || typeof params.question !== 'string') {
        throw new Error('Question parameter is required and must be a string')
      }

      // Check cache first
      const cacheKey = crypto
        .createHash('sha256')
        .update(JSON.stringify({items: params.items, question: params.question}))
        .digest('hex')

      if (this.config.enableCaching) {
        const cached = this.cache.get<SummaryResult>(cacheKey)
        if (cached) {
          this.emit('cacheHit', {function: 'summarize_results', question: params.question})
          return cached
        }
      }

      if (!this.config.enableIntelligentSummarization) {
        // Fallback to basic summarization
        return this.basicSummarization(params, startTime)
      }

      // Prepare content for Gemini analysis
      const searchContent = params.items
        .map(
          (item, index) =>
            `${index + 1}. **${item.title}**\n   URL: ${item.link}\n   Content: ${item.snippet}\n`
        )
        .join('\n')

      const focusAreasText = params.focus_areas?.length
        ? `\n\nPlease focus specifically on these aspects: ${params.focus_areas.join(', ')}`
        : ''

      const prompt = `You are analyzing search results to answer a specific question. Please provide a comprehensive but concise summary.

QUESTION: ${params.question}

SEARCH RESULTS:
${searchContent}

Please provide:
1. A clear, comprehensive summary that directly addresses the question
2. Key points organized logically
3. Citations referencing the source numbers
4. Assessment of information reliability

Maximum length: ${params.max_length || 300} words.
${focusAreasText}

Format your response as a structured analysis with clear sections.`

      // Generate summary using Gemini
      const model = this.geminiClient.models.generateContent({
        model: this.config.geminiModel,
        contents: [
          {
            role: 'user',
            parts: [{text: prompt}]
          }
        ]
      })

      const result = await model
      const summaryText = result.text || ''

      // Extract key points and citations (basic parsing)
      const keyPoints = this.extractKeyPoints(summaryText)
      const citations = this.extractCitations(summaryText, params.items)

      // Calculate confidence based on content analysis
      const confidence = this.calculateConfidence(params.items, summaryText)

      const processingTime = Date.now() - startTime

      const summaryResult: SummaryResult = {
        summary: summaryText,
        relevantResults: params.items,
        keyPoints,
        citations,
        confidence,
        metadata: {
          inputCount: params.items.length,
          processingTime,
          model: this.config.geminiModel,
          timestamp: Date.now()
        },
        success: true
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, summaryResult)
      }

      this.emit('functionComplete', {
        name: 'summarize_results',
        success: true,
        itemCount: params.items.length,
        processingTime,
        confidence
      })

      return summaryResult
    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in summarization'

      this.emit('functionError', {name: 'summarize_results', error: errorMessage})

      // Fallback to basic summarization on error
      if (this.config.enableIntelligentSummarization && params.items?.length > 0) {
        try {
          return await this.basicSummarization(params, startTime)
        } catch {
          // If fallback also fails, return error result
        }
      }

      return {
        summary: '',
        relevantResults: params.items || [],
        keyPoints: [],
        citations: [],
        confidence: 0,
        metadata: {
          inputCount: params.items?.length || 0,
          processingTime,
          model: 'error',
          timestamp: Date.now()
        },
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * Fallback basic summarization without AI
   */
  private async basicSummarization(
    params: SummarizeResultsFunction,
    startTime: number
  ): Promise<SummaryResult> {
    const processingTime = Date.now() - startTime

    // Simple concatenation of snippets
    const summary = params.items
      .slice(0, 5) // Limit to top 5 results
      .map((item, index) => `${index + 1}. ${item.snippet}`)
      .join(' ')

    const keyPoints = params.items.slice(0, 3).map(item => item.title)

    const citations = params.items.slice(0, 3).map(item => item.link)

    return {
      summary: summary.substring(0, (params.max_length || 300) * 6), // Rough word limit
      relevantResults: params.items,
      keyPoints,
      citations,
      confidence: 0.6, // Medium confidence for basic summarization
      metadata: {
        inputCount: params.items.length,
        processingTime,
        model: 'basic',
        timestamp: Date.now()
      },
      success: true
    }
  }

  /**
   * Extract key points from summary text
   */
  private extractKeyPoints(text: string): string[] {
    const keyPoints: string[] = []

    // Look for numbered points or bullet points
    const pointPatterns = [
      /(?:^|\n)\d+\.\s*([^\n]+)/g,
      /(?:^|\n)[•\-*]\s*([^\n]+)/g,
      /(?:^|\n)(?:Key point|Important|Notable):\s*([^\n]+)/gi
    ]

    for (const pattern of pointPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        keyPoints.push(match[1].trim())
      }
    }

    // If no structured points found, extract first few sentences
    if (keyPoints.length === 0) {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20)
      keyPoints.push(...sentences.slice(0, 3).map(s => s.trim()))
    }

    return keyPoints.slice(0, 5) // Limit to 5 key points
  }

  /**
   * Extract citations from summary text
   */
  private extractCitations(text: string, items: SearchResult[]): string[] {
    const citations: string[] = []

    // Look for numbered references in the text
    const referencePattern = /\b(\d+)\b/g
    const foundNumbers = new Set<number>()

    let match
    while ((match = referencePattern.exec(text)) !== null) {
      const num = parseInt(match[1])
      if (num > 0 && num <= items.length) {
        foundNumbers.add(num)
      }
    }

    // Add URLs for referenced items
    for (const num of Array.from(foundNumbers).sort()) {
      if (items[num - 1]) {
        citations.push(items[num - 1].link)
      }
    }

    // If no references found, include first few URLs
    if (citations.length === 0) {
      citations.push(...items.slice(0, 3).map(item => item.link))
    }

    return citations
  }

  /**
   * Calculate confidence score based on content analysis
   */
  private calculateConfidence(items: SearchResult[], summary: string): number {
    let confidence = 0.5 // Base confidence

    // Increase confidence based on number of sources
    if (items.length >= 5) confidence += 0.2
    else if (items.length >= 3) confidence += 0.1

    // Increase confidence based on summary length and detail
    if (summary.length > 500) confidence += 0.1
    if (summary.includes('according to') || summary.includes('based on')) confidence += 0.1

    // Decrease confidence if items have similar snippets (potential duplicates)
    const snippets = items.map(item => item.snippet.toLowerCase())
    const uniqueSnippets = new Set(snippets)
    if (uniqueSnippets.size < snippets.length * 0.8) confidence -= 0.1

    return Math.max(0.1, Math.min(1.0, confidence))
  }

  /**
   * Handle function calls from Gemini Live API
   */
  async handleFunctionCall(
    name: string,
    args: unknown
  ): Promise<ToolCallResult | PageContent | SummaryResult> {
    switch (name) {
      case 'google_search':
        return await this.google_search(args as GoogleSearchFunction)

      case 'fetch_page':
        return await this.fetch_page(args as FetchPageFunction)

      case 'summarize_results':
        return await this.summarize_results(args as SummarizeResultsFunction)

      default:
        throw new Error(`Unknown function: ${name}`)
    }
  }

  /**
   * Get configuration and status information
   */
  getStatus() {
    return {
      config: {
        geminiModel: this.config.geminiModel,
        enableIntelligentSummarization: this.config.enableIntelligentSummarization,
        cachingEnabled: this.config.enableCaching,
        maxPageSize: this.config.maxPageSize,
        pageContentTimeout: this.config.pageContentTimeout
      },
      quota: this.toolCallHandler.getQuotaStatus(),
      cache: {
        search: this.toolCallHandler.getCacheStats(),
        content: {
          keys: this.cache.keys().length,
          stats: this.cache.getStats()
        }
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.toolCallHandler.clearCache()
    this.cache.flushAll()
    this.emit('cacheCleared')
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<GeminiSearchConfig>): void {
    Object.assign(this.config, updates)
    this.toolCallHandler.updateConfig(updates)
    this.emit('configUpdated', this.config)
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.toolCallHandler.destroy()
    this.cache.close()
    this.removeAllListeners()
  }
}

export default GeminiSearchTools
