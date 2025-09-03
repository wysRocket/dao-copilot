#!/usr/bin/env node

/**
 * Comprehensive Test Suite for ToolCallHandler
 * 
 * Tests all aspects of the ToolCallHandler including:
 * - Basic search functionality
 * - Error handling and retries
 * - Caching mechanisms
 * - Rate limiting and quota management
 * - Configuration management
 * - Security features
 */

import { jest } from '@jest/globals';

// Mock dependencies before importing ToolCallHandler
jest.unstable_mockModule('axios', () => ({
  default: {
    get: jest.fn()
  }
}));

jest.unstable_mockModule('node-cache', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    getStats: jest.fn().mockReturnValue({ keys: 0, hits: 0, misses: 0 }),
    flushAll: jest.fn(),
    close: jest.fn()
  }))
}));

// Import after mocking
const axios = (await import('axios')).default;
const NodeCache = (await import('node-cache')).default;

// Now import ToolCallHandler
const { ToolCallHandler, ToolCallError, QuotaExceededError, RateLimitError } = 
  await import('../src/services/tool-call-handler.js');

describe('ToolCallHandler', () => {
  let handler;
  let mockAxios;
  let mockCache;

  const mockConfig = {
    apiKey: 'test-api-key-12345',
    searchEngineId: 'test-search-engine-id',
    timeout: 5000,
    maxRetries: 2,
    enableCaching: true
  };

  const mockSearchResponse = {
    kind: 'customsearch#search',
    url: { type: 'application/json', template: 'test' },
    queries: {
      request: [{
        title: 'Google Custom Search - test',
        totalResults: '1000000',
        searchTerms: 'test',
        count: 10,
        startIndex: 1
      }]
    },
    searchInformation: {
      searchTime: 0.123456,
      formattedSearchTime: '0.12',
      totalResults: '1000000',
      formattedTotalResults: '1,000,000'
    },
    items: [
      {
        title: 'Test Result 1',
        link: 'https://example.com/1',
        snippet: 'This is a test search result snippet.',
        displayLink: 'example.com'
      },
      {
        title: 'Test Result 2',
        link: 'https://example.com/2',
        snippet: 'Another test search result snippet.',
        displayLink: 'example.com'
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAxios = axios;
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      getStats: jest.fn().mockReturnValue({ keys: 0, hits: 0, misses: 0 }),
      flushAll: jest.fn(),
      close: jest.fn()
    };
    
    NodeCache.mockImplementation(() => mockCache);
    
    handler = new ToolCallHandler(mockConfig);
  });

  afterEach(() => {
    if (handler) {
      handler.destroy();
    }
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with required configuration', () => {
      expect(handler).toBeDefined();
      expect(handler.getQuotaStatus().limit).toBe(100); // Default free tier
    });

    test('should load external configuration if available', () => {
      const configPath = 'google-search-config.json';
      const mockFs = require('fs');
      const mockConfig = {
        rateLimits: { free: { dailyLimit: 150 } },
        security: { maxQueryLength: 1024 }
      };
      
      jest.spyOn(mockFs, 'existsSync').mockReturnValue(true);
      jest.spyOn(mockFs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
      
      const newHandler = new ToolCallHandler(mockConfig);
      expect(newHandler.getQuotaStatus().limit).toBe(150);
      
      mockFs.existsSync.mockRestore();
      mockFs.readFileSync.mockRestore();
      newHandler.destroy();
    });

    test('should handle missing external configuration gracefully', () => {
      const mockFs = require('fs');
      jest.spyOn(mockFs, 'existsSync').mockReturnValue(false);
      
      const newHandler = new ToolCallHandler(mockConfig);
      expect(newHandler.getQuotaStatus().limit).toBe(100); // Should use defaults
      
      mockFs.existsSync.mockRestore();
      newHandler.destroy();
    });
  });

  describe('Basic Search Functionality', () => {
    test('should perform successful search', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      const result = await handler.executeGoogleSearch('test query');
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSearchResponse);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe('Test Result 1');
      expect(result.metadata.cacheHit).toBe(false);
      expect(result.metadata.source).toBe('api');
    });

    test('should handle search with options', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      const options = { num: 5, safe: 'active' };
      const result = await handler.executeGoogleSearch('test query', options);
      
      expect(result.success).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'test query',
            num: 5,
            safe: 'active'
          })
        })
      );
    });

    test('should handle empty search results', async () => {
      const emptyResponse = { ...mockSearchResponse, items: [] };
      mockAxios.get.mockResolvedValue({ data: emptyResponse });
      
      const result = await handler.executeGoogleSearch('nonexistent query');
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    test('should sanitize malicious queries', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      const maliciousQuery = '<script>alert("xss")</script>javascript:void(0)';
      const result = await handler.executeGoogleSearch(maliciousQuery);
      
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'scriptalert("xss")/scriptvoid(0)' // Sanitized
          })
        })
      );
    });

    test('should reject empty queries', async () => {
      const result = await handler.executeGoogleSearch('   ');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty or invalid search query');
    });
  });

  describe('Caching Functionality', () => {
    test('should cache successful search results', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      mockCache.get.mockReturnValue(null); // No cache hit
      
      const result = await handler.executeGoogleSearch('cached query');
      
      expect(result.success).toBe(true);
      expect(mockCache.set).toHaveBeenCalled();
      expect(result.metadata.cacheHit).toBe(false);
    });

    test('should return cached results when available', async () => {
      const cachedResult = {
        success: true,
        data: mockSearchResponse,
        results: mockSearchResponse.items,
        metadata: {
          query: 'cached query',
          timestamp: Date.now() - 1000,
          responseTime: 100,
          cacheHit: false,
          quotaUsed: 1,
          source: 'api'
        }
      };
      
      mockCache.get.mockReturnValue(cachedResult);
      
      const result = await handler.executeGoogleSearch('cached query');
      
      expect(result.success).toBe(true);
      expect(result.metadata.cacheHit).toBe(true);
      expect(result.metadata.source).toBe('cache');
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    test('should not cache error results', async () => {
      mockAxios.get.mockRejectedValue(new Error('API Error'));
      
      const result = await handler.executeGoogleSearch('error query');
      
      expect(result.success).toBe(false);
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    test('should provide cache statistics', () => {
      mockCache.getStats.mockReturnValue({ keys: 10, hits: 8, misses: 2 });
      
      const stats = handler.getCacheStats();
      
      expect(stats.keys).toBe(10);
      expect(stats.hits).toBe(8);
      expect(stats.misses).toBe(2);
    });

    test('should clear cache', () => {
      handler.clearCache();
      expect(mockCache.flushAll).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Retries', () => {
    test('should handle 400 Bad Request errors', async () => {
      const error = {
        response: {
          status: 400,
          data: { error: { message: 'Invalid parameters' } }
        }
      };
      mockAxios.get.mockRejectedValue(error);
      
      const result = await handler.executeGoogleSearch('bad query');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Bad Request');
      expect(mockAxios.get).toHaveBeenCalledTimes(1); // No retries for 400
    });

    test('should handle 403 Quota Exceeded errors', async () => {
      const error = {
        response: {
          status: 403,
          data: { error: { message: 'Daily Limit Exceeded' } }
        }
      };
      mockAxios.get.mockRejectedValue(error);
      
      const result = await handler.executeGoogleSearch('quota query');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Daily quota exceeded');
    });

    test('should retry on 429 Rate Limit errors', async () => {
      const error = {
        response: {
          status: 429,
          data: { error: { message: 'Rate Limit Exceeded' } }
        }
      };
      
      // First call fails, second succeeds
      mockAxios.get
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: mockSearchResponse });
      
      const result = await handler.executeGoogleSearch('retry query');
      
      expect(result.success).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });

    test('should retry on 5xx server errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Internal Server Error' } }
        }
      };
      
      // Both retries fail
      mockAxios.get.mockRejectedValue(error);
      
      const result = await handler.executeGoogleSearch('server error query');
      
      expect(result.success).toBe(false);
      expect(mockAxios.get).toHaveBeenCalledTimes(2); // maxRetries = 2
    });

    test('should handle timeout errors', async () => {
      const error = { code: 'ECONNABORTED' };
      mockAxios.get.mockRejectedValue(error);
      
      const result = await handler.executeGoogleSearch('timeout query');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('should handle network errors', async () => {
      const error = { code: 'ENOTFOUND' };
      mockAxios.get.mockRejectedValue(error);
      
      const result = await handler.executeGoogleSearch('network query');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network connectivity');
    });
  });

  describe('Quota Management', () => {
    test('should track quota usage', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      const initialQuota = handler.getQuotaStatus();
      expect(initialQuota.used).toBe(0);
      
      await handler.executeGoogleSearch('quota test');
      
      const updatedQuota = handler.getQuotaStatus();
      expect(updatedQuota.used).toBe(1);
    });

    test('should prevent searches when quota exceeded', async () => {
      // Manually set quota to maximum
      const quotaStatus = handler.getQuotaStatus();
      handler.quotaTracker = { ...quotaStatus, used: quotaStatus.limit };
      
      const result = await handler.executeGoogleSearch('over quota');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('quota exceeded');
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    test('should emit quota warning events', (done) => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      handler.on('quotaWarning', (warning) => {
        expect(warning.percent).toBeGreaterThanOrEqual(80);
        done();
      });
      
      // Simulate high quota usage
      handler.quotaTracker = { 
        used: 85, 
        limit: 100, 
        resetTime: Date.now() + 86400000, 
        lastReset: Date.now() 
      };
      
      handler.executeGoogleSearch('warning test');
    });

    test('should reset quota at scheduled time', (done) => {
      handler.on('quotaReset', (quotaTracker) => {
        expect(quotaTracker.used).toBe(0);
        done();
      });
      
      // Manually trigger quota reset
      handler.resetQuota();
    });
  });

  describe('Tool Call Interface', () => {
    test('should handle google_search tool calls', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      const result = await handler.handleToolCall('google_search', { 
        query: 'tool call test' 
      });
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    test('should handle alternative tool names', async () => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      const result1 = await handler.handleToolCall('search', { query: 'test' });
      const result2 = await handler.handleToolCall('web_search', { query: 'test' });
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    test('should reject unsupported tool calls', async () => {
      await expect(handler.handleToolCall('unsupported_tool', {}))
        .rejects.toThrow('Unsupported tool');
    });
  });

  describe('Result Formatting', () => {
    test('should format search results for display', () => {
      const formatted = handler.formatSearchResults(mockSearchResponse.items);
      
      expect(formatted).toContain('Found 2 search results');
      expect(formatted).toContain('Test Result 1');
      expect(formatted).toContain('Test Result 2');
      expect(formatted).toContain('https://example.com/1');
      expect(formatted).toContain('This is a test search result snippet');
    });

    test('should limit displayed results', () => {
      const manyResults = Array.from({ length: 10 }, (_, i) => ({
        title: `Result ${i + 1}`,
        link: `https://example.com/${i + 1}`,
        snippet: `Snippet ${i + 1}`,
        displayLink: 'example.com'
      }));
      
      const formatted = handler.formatSearchResults(manyResults, 3);
      
      expect(formatted).toContain('Found 10 search results');
      expect(formatted).toContain('Result 1');
      expect(formatted).toContain('Result 3');
      expect(formatted).not.toContain('Result 4');
      expect(formatted).toContain('and 7 more results');
    });

    test('should handle empty results', () => {
      const formatted = handler.formatSearchResults([]);
      expect(formatted).toBe('No search results found.');
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const newConfig = { 
        timeout: 15000,
        maxRetries: 5 
      };
      
      handler.updateConfig(newConfig);
      
      expect(handler.config.timeout).toBe(15000);
      expect(handler.config.maxRetries).toBe(5);
    });

    test('should emit configuration update events', (done) => {
      handler.on('configUpdated', (config) => {
        expect(config.timeout).toBe(20000);
        done();
      });
      
      handler.updateConfig({ timeout: 20000 });
    });
  });

  describe('Event System', () => {
    test('should emit search events', (done) => {
      mockAxios.get.mockResolvedValue({ data: mockSearchResponse });
      
      let eventsReceived = 0;
      const expectedEvents = 2; // searchStart and searchComplete
      
      handler.on('searchStart', (data) => {
        expect(data.query).toBe('event test');
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });
      
      handler.on('searchComplete', (data) => {
        expect(data.resultCount).toBe(2);
        expect(data.responseTime).toBeGreaterThan(0);
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });
      
      handler.executeGoogleSearch('event test');
    });

    test('should emit error events', (done) => {
      const error = new Error('Test error');
      mockAxios.get.mockRejectedValue(error);
      
      handler.on('searchError', (data) => {
        expect(data.query).toBe('error test');
        expect(data.error).toContain('Test error');
        done();
      });
      
      handler.executeGoogleSearch('error test');
    });

    test('should emit cache events', (done) => {
      const cachedResult = {
        success: true,
        data: mockSearchResponse,
        results: mockSearchResponse.items,
        metadata: {
          query: 'cached query',
          timestamp: Date.now(),
          responseTime: 100,
          cacheHit: false,
          quotaUsed: 1,
          source: 'api'
        }
      };
      
      mockCache.get.mockReturnValue(cachedResult);
      
      handler.on('cacheHit', (data) => {
        expect(data.query).toBe('cache test');
        done();
      });
      
      handler.executeGoogleSearch('cache test');
    });
  });

  describe('Resource Cleanup', () => {
    test('should cleanup resources on destroy', () => {
      handler.destroy();
      
      expect(mockCache.close).toHaveBeenCalled();
      expect(handler.listenerCount('searchComplete')).toBe(0);
    });
  });
});

console.log('🧪 ToolCallHandler Test Suite Complete');
console.log('To run these tests, use: npm test tool-call-handler');