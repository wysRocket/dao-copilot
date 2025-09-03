/**
 * Tool Call Result Parser
 *
 * Utility functions to parse and structure tool call results from various sources
 * into standardized formats for UI components.
 */

import {SearchResult} from '../components/SearchResultCard'

// Type definitions for parsing
interface GoogleSearchResponse {
  items?: GoogleSearchItem[]
  results?: GoogleSearchItem[]
}

interface GoogleSearchItem {
  title?: string
  snippet?: string
  description?: string
  link?: string
  displayLink?: string
  formattedUrl?: string
  pagemap?: {
    cse_thumbnail?: Array<{src: string; width: string; height: string}>
    metatags?: Array<{[key: string]: string}>
  }
}

/**
 * Parse Google Search API response into SearchResult array
 */
export function parseGoogleSearchResults(response: unknown): SearchResult[] {
  if (!response) return []

  // Handle direct array of results
  if (Array.isArray(response)) {
    return response.map(parseSearchItem).filter((item): item is SearchResult => item !== null)
  }

  const typedResponse = response as GoogleSearchResponse

  // Handle Google Custom Search API response structure
  if (typedResponse.items && Array.isArray(typedResponse.items)) {
    return typedResponse.items
      .map(parseSearchItem)
      .filter((item): item is SearchResult => item !== null)
  }

  // Handle wrapped response
  if (typedResponse.results && Array.isArray(typedResponse.results)) {
    return typedResponse.results
      .map(parseSearchItem)
      .filter((item): item is SearchResult => item !== null)
  }

  // Handle single result
  const singleResult = response as GoogleSearchItem
  if (singleResult.title && singleResult.link) {
    const parsed = parseSearchItem(singleResult)
    return parsed ? [parsed] : []
  }

  return []
}

/**
 * Parse individual search item into SearchResult
 */
function parseSearchItem(item: unknown): SearchResult | null {
  if (!item || typeof item !== 'object') return null

  const typedItem = item as GoogleSearchItem

  // Required fields
  if (!typedItem.title || !typedItem.link) return null

  return {
    title: sanitizeText(typedItem.title),
    snippet: sanitizeText(typedItem.snippet || typedItem.description || ''),
    link: typedItem.link,
    displayLink: typedItem.displayLink || typedItem.formattedUrl,
    formattedUrl: typedItem.formattedUrl,
    pagemap: typedItem.pagemap
  }
}

type ToolCallResultType = 'search' | 'webpage' | 'summary' | 'unknown'

interface ParsedToolCallResult {
  type: ToolCallResultType
  data: unknown
  displayTitle: string
}

/**
 * Parse tool call result based on function name
 */
export function parseToolCallResult(functionName: string, result: unknown): ParsedToolCallResult {
  switch (functionName) {
    case 'google_search':
      return {
        type: 'search',
        data: parseGoogleSearchResults(result),
        displayTitle: 'Search Results'
      }

    case 'fetch_page':
      return {
        type: 'webpage',
        data: parseWebpageResult(result),
        displayTitle: 'Webpage Content'
      }

    case 'summarize_results':
      return {
        type: 'summary',
        data: parseSummaryResult(result),
        displayTitle: 'Summary'
      }

    default:
      return {
        type: 'unknown',
        data: result,
        displayTitle: 'Tool Result'
      }
  }
}

interface WebpageResult {
  title?: string
  url?: string
  content?: string
  text?: string
  metadata?: unknown
  wordCount?: number
  readingTime?: number
}

/**
 * Parse webpage fetch result
 */
function parseWebpageResult(result: unknown) {
  if (!result) return null

  const typedResult = result as WebpageResult

  return {
    title: typedResult.title || 'Webpage Content',
    url: typedResult.url,
    content: sanitizeText(typedResult.content || typedResult.text || ''),
    metadata: typedResult.metadata,
    wordCount: typedResult.wordCount,
    readingTime: typedResult.readingTime
  }
}

interface SummaryResult {
  summary?: string
  text?: string
  keyPoints?: string[]
  sources?: string[]
  confidence?: number
  type?: string
}

/**
 * Parse summary result
 */
function parseSummaryResult(result: unknown) {
  if (!result) return null

  if (typeof result === 'string') {
    return {
      summary: sanitizeText(result),
      type: 'text'
    }
  }

  const typedResult = result as SummaryResult

  return {
    summary: sanitizeText(typedResult.summary || typedResult.text || ''),
    keyPoints: Array.isArray(typedResult.keyPoints) ? typedResult.keyPoints : [],
    sources: Array.isArray(typedResult.sources) ? typedResult.sources : [],
    confidence: typedResult.confidence,
    type: typedResult.type || 'structured'
  }
}

/**
 * Sanitize and clean text content
 */
function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return ''

  return (
    text
      .replace(/\s+/g, ' ') // Normalize whitespace
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Remove control characters
      .trim()
  )
}

/**
 * Extract metadata from search results for analytics
 */
export function extractSearchMetadata(results: SearchResult[]) {
  return {
    totalResults: results.length,
    domains: [
      ...new Set(
        results.map(r => {
          try {
            return new URL(r.link).hostname
          } catch {
            return 'unknown'
          }
        })
      )
    ],
    hasImages: results.some(r => r.pagemap?.cse_thumbnail),
    avgSnippetLength: results.reduce((acc, r) => acc + (r.snippet?.length || 0), 0) / results.length
  }
}

interface ChatFormatResult {
  component: 'SearchResultsGrid' | 'WebpageCard' | 'SummaryCard' | 'RawJson'
  props: Record<string, unknown>
  fallbackText: string
}

/**
 * Format tool call result for display in chat
 */
export function formatToolCallForChat(functionName: string, result: unknown): ChatFormatResult {
  const parsed = parseToolCallResult(functionName, result)

  switch (parsed.type) {
    case 'search': {
      const searchResults = parsed.data as SearchResult[]
      return {
        component: 'SearchResultsGrid',
        props: {
          results: searchResults,
          title: parsed.displayTitle,
          compact: searchResults.length > 3
        },
        fallbackText: `Found ${searchResults.length} search results`
      }
    }

    case 'webpage': {
      const webpageData = parsed.data as {title?: string} | null
      return {
        component: 'WebpageCard',
        props: parsed.data as Record<string, unknown>,
        fallbackText: `Fetched webpage: ${webpageData?.title || 'Unknown'}`
      }
    }

    case 'summary': {
      const summaryData = parsed.data as {summary?: string} | null
      return {
        component: 'SummaryCard',
        props: parsed.data as Record<string, unknown>,
        fallbackText: `Generated summary: ${summaryData?.summary?.slice(0, 100) || 'Generated'}...`
      }
    }

    default:
      return {
        component: 'RawJson',
        props: {data: result},
        fallbackText: `Tool result from ${functionName}`
      }
  }
}

export default {
  parseGoogleSearchResults,
  parseToolCallResult,
  formatToolCallForChat,
  extractSearchMetadata
}
