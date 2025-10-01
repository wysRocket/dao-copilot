/**
 * ToolCallHandler - Google Search Integration for AI Answering Machine
 * 
 * This class handles Tool Calls for the AI Answering Machine, specifically
 * Google Search queries triggered by detected questions. It includes
 * comprehensive error handling, rate limiting, caching, and performance
 * optimization for real-time conversational AI.
 */

import axios, { AxiosError } from 'axios';
import { EventEmitter } from 'events';
import NodeCache from 'node-cache';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Interfaces and Types
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  formattedUrl?: string;
  htmlSnippet?: string;
  cacheId?: string;
  pagemap?: {
    cse_thumbnail?: Array<{ src: string; width: string; height: string }>;
    metatags?: Array<{ [key: string]: string }>;
    cse_image?: Array<{ src: string }>;
  };
}

export interface SearchResponse {
  kind: string;
  url: {
    type: string;
    template: string;
  };
  queries: {
    request: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
    }>;
    nextPage?: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
    }>;
  };
  context?: object;
  searchInformation: {
    searchTime: number;
    formattedSearchTime: string;
    totalResults: string;
    formattedTotalResults: string;
  };
  items?: SearchResult[];
}

export interface SearchOptions {
  num?: number;
  start?: number;
  safe?: 'active' | 'moderate' | 'off';
  fileType?: string;
  searchType?: 'image';
  imgType?: 'clipart' | 'face' | 'lineart' | 'stock' | 'photo' | 'animated';
  imgSize?: 'huge' | 'icon' | 'large' | 'medium' | 'small' | 'xlarge' | 'xxlarge';
  rights?: string;
  gl?: string; // geolocation
  hl?: string; // interface language
  filter?: '0' | '1'; // duplicate content filter
  dateRestrict?: string; // date restriction
  exactTerms?: string;
  excludeTerms?: string;
  orTerms?: string;
  linkSite?: string;
  relatedSite?: string;
  siteSearch?: string;
  siteSearchFilter?: 'e' | 'i'; // exclude or include site
}

export interface ToolCallConfig {
  apiKey: string;
  searchEngineId: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  exponentialBackoff?: boolean;
  enableCaching?: boolean;
  cacheTtlSeconds?: number;
  maxCacheEntries?: number;
  rateLimit?: {
    dailyLimit: number;
    intervalMs: number;
  };
  security?: {
    sanitizeQueries: boolean;
    maxQueryLength: number;
    allowedDomains: string[];
    blockedDomains: string[];
  };
}

export interface ToolCallResult {
  success: boolean;
  data?: SearchResponse;
  results?: SearchResult[];
  error?: string;
  metadata: {
    query: string;
    timestamp: number;
    responseTime: number;
    cacheHit: boolean;
    quotaUsed: number;
    source: 'cache' | 'api' | 'fallback';
  };
}

export interface QuotaTracker {
  used: number;
  limit: number;
  resetTime: number;
  lastReset: number;
}

// Custom Errors
export class ToolCallError extends Error {
  public code: string;
  public statusCode?: number;
  public retryable: boolean;

  constructor(message: string, code: string, statusCode?: number, retryable: boolean = false) {
    super(message);
    this.name = 'ToolCallError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class QuotaExceededError extends ToolCallError {
  constructor(message: string = 'Daily quota exceeded') {
    super(message, 'QUOTA_EXCEEDED', 403, false);
  }
}

export class RateLimitError extends ToolCallError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', 429, true);
  }
}

/**
 * Main ToolCallHandler Class
 * 
 * Handles Google Search API calls with comprehensive error handling,
 * caching, rate limiting, and performance optimization.
 */
export class ToolCallHandler extends EventEmitter {
  private config: Required<ToolCallConfig>;
  private cache: NodeCache;
  private quotaTracker: QuotaTracker;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private configPath: string;

  constructor(config: ToolCallConfig) {
    super();

    // Set up default configuration
    this.config = {
      apiKey: config.apiKey,
      searchEngineId: config.searchEngineId,
      baseUrl: config.baseUrl || 'https://www.googleapis.com/customsearch/v1',
      timeout: config.timeout || 10000,
      maxRetries: config.maxRetries || 3,
      retryDelayMs: config.retryDelayMs || 1000,
      exponentialBackoff: config.exponentialBackoff ?? true,
      enableCaching: config.enableCaching ?? true,
      cacheTtlSeconds: config.cacheTtlSeconds || 3600,
      maxCacheEntries: config.maxCacheEntries || 1000,
      rateLimit: config.rateLimit || {
        dailyLimit: 100, // Default free tier
        intervalMs: 24 * 60 * 60 * 1000 // 24 hours
      },
      security: {
        sanitizeQueries: config.security?.sanitizeQueries ?? true,
        maxQueryLength: config.security?.maxQueryLength || 2048,
        allowedDomains: config.security?.allowedDomains || [],
        blockedDomains: config.security?.blockedDomains || []
      }
    };

    // Initialize cache if enabled
    if (this.config.enableCaching) {
      this.cache = new NodeCache({
        stdTTL: this.config.cacheTtlSeconds,
        maxKeys: this.config.maxCacheEntries,
        useClones: false
      });
    }

    // Initialize quota tracker
    this.quotaTracker = {
      used: 0,
      limit: this.config.rateLimit.dailyLimit,
      resetTime: this.getNextResetTime(),
      lastReset: Date.now()
    };

    // Try to load external configuration
    this.configPath = path.join(process.cwd(), 'google-search-config.json');
    this.loadExternalConfig();

    // Set up periodic quota reset
    this.setupQuotaReset();
  }

  /**
   * Load external configuration file if it exists
   */
  private loadExternalConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const externalConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        
        // Merge rate limits
        if (externalConfig.rateLimits?.free && this.config.rateLimit.dailyLimit <= 100) {
          this.config.rateLimit.dailyLimit = externalConfig.rateLimits.free.dailyLimit;
        } else if (externalConfig.rateLimits?.paid && this.config.rateLimit.dailyLimit > 100) {
          this.config.rateLimit.dailyLimit = externalConfig.rateLimits.paid.dailyLimit;
        }

        // Merge security settings
        if (externalConfig.security) {
          this.config.security = { ...this.config.security, ...externalConfig.security };
        }

        // Merge error handling settings
        if (externalConfig.errorHandling) {
          this.config.maxRetries = externalConfig.errorHandling.maxRetries || this.config.maxRetries;
          this.config.retryDelayMs = externalConfig.errorHandling.retryDelayMs || this.config.retryDelayMs;
          this.config.exponentialBackoff = externalConfig.errorHandling.exponentialBackoff ?? this.config.exponentialBackoff;
        }

        // Merge caching settings
        if (externalConfig.caching) {
          this.config.enableCaching = externalConfig.caching.enabled ?? this.config.enableCaching;
          this.config.cacheTtlSeconds = externalConfig.caching.ttlSeconds || this.config.cacheTtlSeconds;
          this.config.maxCacheEntries = externalConfig.caching.maxEntries || this.config.maxCacheEntries;
        }
      }
    } catch (error) {
      this.emit('warning', `Failed to load external config: ${error.message}`);
    }
  }

  /**
   * Get the next quota reset time (midnight Pacific Time)
   */
  private getNextResetTime(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(8, 0, 0, 0); // 8 AM UTC = Midnight Pacific Time
    return tomorrow.getTime();
  }

  /**
   * Set up automatic quota reset
   */
  private setupQuotaReset(): void {
    const checkInterval = 60000; // Check every minute
    
    setInterval(() => {
      if (Date.now() >= this.quotaTracker.resetTime) {
        this.resetQuota();
      }
    }, checkInterval);
  }

  /**
   * Reset the daily quota
   */
  private resetQuota(): void {
    this.quotaTracker.used = 0;
    this.quotaTracker.lastReset = Date.now();
    this.quotaTracker.resetTime = this.getNextResetTime();
    this.emit('quotaReset', this.quotaTracker);
  }

  /**
   * Check if quota is available
   */
  private checkQuota(): boolean {
    return this.quotaTracker.used < this.quotaTracker.limit;
  }

  /**
   * Increment quota usage
   */
  private incrementQuota(): void {
    this.quotaTracker.used++;
    this.emit('quotaUpdate', this.quotaTracker);
    
    // Warn when approaching limit
    const usagePercent = (this.quotaTracker.used / this.quotaTracker.limit) * 100;
    if (usagePercent >= 80 && usagePercent < 85) {
      this.emit('quotaWarning', { 
        used: this.quotaTracker.used, 
        limit: this.quotaTracker.limit, 
        percent: usagePercent 
      });
    }
  }

  /**
   * Sanitize search query
   */
  private sanitizeQuery(query: string): string {
    if (!this.config.security.sanitizeQueries) {
      return query;
    }

    // Remove potentially harmful characters
    let sanitized = query
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/data:/gi, '') // Remove data protocol
      .replace(/vbscript:/gi, '') // Remove vbscript protocol
      .trim();

    // Limit query length
    if (sanitized.length > this.config.security.maxQueryLength) {
      sanitized = sanitized.substring(0, this.config.security.maxQueryLength);
    }

    return sanitized;
  }

  /**
   * Generate cache key for search query
   */
  private generateCacheKey(query: string, options: SearchOptions = {}): string {
    const key = `${query}:${JSON.stringify(options)}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Check cache for existing results
   */
  private getCachedResult(cacheKey: string): ToolCallResult | null {
    if (!this.config.enableCaching || !this.cache) {
      return null;
    }

    const cached = this.cache.get<ToolCallResult>(cacheKey);
    if (cached) {
      // Update metadata to indicate cache hit
      cached.metadata.cacheHit = true;
      cached.metadata.source = 'cache';
      cached.metadata.timestamp = Date.now();
      return cached;
    }

    return null;
  }

  /**
   * Cache search result
   */
  private setCachedResult(cacheKey: string, result: ToolCallResult): void {
    if (!this.config.enableCaching || !this.cache) {
      return;
    }

    // Don't cache errors
    if (!result.success) {
      return;
    }

    this.cache.set(cacheKey, result);
  }

  /**
   * Wait for rate limiting
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 100; // Minimum 100ms between requests

    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }
  }

  /**
   * Execute HTTP request with retries
   */
  private async executeRequest(url: string, params: object): Promise<SearchResponse> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();
        this.lastRequestTime = Date.now();

        const response = await axios.get<SearchResponse>(url, {
          params,
          timeout: this.config.timeout,
          headers: {
            'User-Agent': 'AI-Answering-Machine/1.0.0',
            'Accept': 'application/json'
          }
        });

        return response.data;

      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof AxiosError && error.response) {
          const status = error.response.status;
          const errorData = error.response.data;

          // Handle specific error codes
          switch (status) {
            case 400:
              throw new ToolCallError(
                `Bad Request: ${errorData.error?.message || 'Invalid parameters'}`,
                'BAD_REQUEST',
                400,
                false
              );
            case 403:
              if (errorData.error?.message?.includes('Daily Limit Exceeded')) {
                throw new QuotaExceededError();
              } else {
                throw new ToolCallError(
                  `Access Denied: ${errorData.error?.message || 'Check API permissions'}`,
                  'ACCESS_DENIED',
                  403,
                  false
                );
              }
            case 429:
              if (attempt < this.config.maxRetries) {
                const delay = this.config.exponentialBackoff 
                  ? this.config.retryDelayMs * Math.pow(2, attempt - 1)
                  : this.config.retryDelayMs;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              } else {
                throw new RateLimitError();
              }
            case 500:
            case 502:
            case 503:
            case 504:
              if (attempt < this.config.maxRetries) {
                const delay = this.config.exponentialBackoff 
                  ? this.config.retryDelayMs * Math.pow(2, attempt - 1)
                  : this.config.retryDelayMs;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              break;
            default:
              throw new ToolCallError(
                `HTTP ${status}: ${errorData.error?.message || error.message}`,
                'HTTP_ERROR',
                status,
                false
              );
          }
        } else if (error.code === 'ECONNABORTED') {
          if (attempt < this.config.maxRetries) {
            continue;
          }
          throw new ToolCallError('Request timeout', 'TIMEOUT', undefined, true);
        } else if (error.code === 'ENOTFOUND') {
          throw new ToolCallError('Network connectivity issue', 'NETWORK_ERROR', undefined, false);
        }

        // If we've exhausted retries, throw the last error
        if (attempt === this.config.maxRetries) {
          break;
        }
      }
    }

    throw new ToolCallError(
      `Request failed after ${this.config.maxRetries} attempts: ${lastError.message}`,
      'MAX_RETRIES_EXCEEDED',
      undefined,
      false
    );
  }

  /**
   * Execute Google Search
   */
  async executeGoogleSearch(query: string, options: SearchOptions = {}): Promise<ToolCallResult> {
    const startTime = Date.now();
    
    try {
      // Sanitize query
      const sanitizedQuery = this.sanitizeQuery(query);
      if (!sanitizedQuery.trim()) {
        throw new ToolCallError('Empty or invalid search query', 'INVALID_QUERY', 400, false);
      }

      // Check quota
      if (!this.checkQuota()) {
        throw new QuotaExceededError();
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(sanitizedQuery, options);
      
      // Check cache first
      if (this.config.enableCaching) {
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
          this.emit('cacheHit', { query: sanitizedQuery, cacheKey });
          return cachedResult;
        }
      }

      // Prepare API parameters
      const params = {
        key: this.config.apiKey,
        cx: this.config.searchEngineId,
        q: sanitizedQuery,
        ...options
      };

      // Execute API request
      this.emit('searchStart', { query: sanitizedQuery, options });
      
      const data = await this.executeRequest(this.config.baseUrl, params);
      
      // Increment quota
      this.incrementQuota();

      // Process results
      const results: SearchResult[] = data.items || [];
      const responseTime = Date.now() - startTime;

      // Create result object
      const result: ToolCallResult = {
        success: true,
        data,
        results,
        metadata: {
          query: sanitizedQuery,
          timestamp: Date.now(),
          responseTime,
          cacheHit: false,
          quotaUsed: this.quotaTracker.used,
          source: 'api'
        }
      };

      // Cache the result
      this.setCachedResult(cacheKey, result);

      this.emit('searchComplete', { 
        query: sanitizedQuery, 
        resultCount: results.length, 
        responseTime 
      });

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      let toolError: ToolCallError;
      if (error instanceof ToolCallError) {
        toolError = error;
      } else {
        toolError = new ToolCallError(
          `Search failed: ${error.message}`,
          'SEARCH_FAILED',
          undefined,
          false
        );
      }

      this.emit('searchError', { 
        query, 
        error: toolError.message, 
        code: toolError.code,
        responseTime 
      });

      return {
        success: false,
        error: toolError.message,
        metadata: {
          query,
          timestamp: Date.now(),
          responseTime,
          cacheHit: false,
          quotaUsed: this.quotaTracker.used,
          source: 'api'
        }
      };
    }
  }

  /**
   * Handle generic tool call (extensible for future tools)
   */
  async handleToolCall(toolName: string, params: any): Promise<ToolCallResult> {
    switch (toolName.toLowerCase()) {
      case 'google_search':
      case 'search':
      case 'web_search':
        return this.executeGoogleSearch(params.query || params.q, params.options);
      
      default:
        throw new ToolCallError(
          `Unsupported tool: ${toolName}`,
          'UNSUPPORTED_TOOL',
          400,
          false
        );
    }
  }

  /**
   * Format search results for display
   */
  formatSearchResults(results: SearchResult[], maxResults: number = 5): string {
    if (!results || results.length === 0) {
      return 'No search results found.';
    }

    const displayResults = results.slice(0, maxResults);
    let formatted = `Found ${results.length} search results:\n\n`;

    displayResults.forEach((result, index) => {
      formatted += `${index + 1}. **${result.title}**\n`;
      formatted += `   ${result.snippet}\n`;
      formatted += `   🔗 ${result.link}\n\n`;
    });

    if (results.length > maxResults) {
      formatted += `... and ${results.length - maxResults} more results.\n`;
    }

    return formatted;
  }

  /**
   * Get current quota status
   */
  getQuotaStatus(): QuotaTracker & { usagePercent: number } {
    const usagePercent = (this.quotaTracker.used / this.quotaTracker.limit) * 100;
    return {
      ...this.quotaTracker,
      usagePercent
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { keys: number; hits: number; misses: number } {
    if (!this.cache) {
      return { keys: 0, hits: 0, misses: 0 };
    }

    const stats = this.cache.getStats();
    return {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.flushAll();
      this.emit('cacheCleared');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ToolCallConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update cache if caching settings changed
    if (updates.enableCaching !== undefined || updates.cacheTtlSeconds || updates.maxCacheEntries) {
      if (this.config.enableCaching && !this.cache) {
        this.cache = new NodeCache({
          stdTTL: this.config.cacheTtlSeconds,
          maxKeys: this.config.maxCacheEntries,
          useClones: false
        });
      } else if (!this.config.enableCaching && this.cache) {
        this.cache.close();
        this.cache = null;
      }
    }

    // Update quota tracker if rate limits changed
    if (updates.rateLimit) {
      this.quotaTracker.limit = this.config.rateLimit.dailyLimit;
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cache) {
      this.cache.close();
    }
    this.removeAllListeners();
  }
}

export default ToolCallHandler;