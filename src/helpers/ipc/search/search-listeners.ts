import {ipcMain} from 'electron'
import {SEARCH_GOOGLE_CHANNEL, SEARCH_GEMINI_ANALYZE_CHANNEL} from './search-channels'
import GeminiSearchTools, {GeminiSearchConfig} from '../../../services/gemini-search-tools'
import {SearchResult} from '../../../services/tool-call-handler'
import type {GoogleSearchParams, GeminiAnalyzeParams} from './search-context'

let searchTools: GeminiSearchTools | null = null

// Initialize search tools with environment variables from main process
function initializeSearchTools(): GeminiSearchTools {
  if (!searchTools) {
    const apiKey =
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GOOGLE_API_KEY ||
      process.env.GOOGLE_SEARCH_API_KEY ||
      ''
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || process.env.SEARCH_ENGINE_ID || ''
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''

    console.log('Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.')
    console.log('API Key configured:', apiKey ? 'Yes' : 'No')
    console.log('Search Engine ID configured:', searchEngineId ? 'Yes' : 'No')

    const config: GeminiSearchConfig = {
      apiKey,
      searchEngineId,
      geminiApiKey,
      enableCaching: true,
      cacheTtlSeconds: 3600,
      maxRetries: 2,
      timeout: 10000
    }

    searchTools = new GeminiSearchTools(config)

    // Set up event listeners
    searchTools.on('searchStart', data => {
      console.log('🔍 Search started:', data)
    })

    searchTools.on('searchComplete', data => {
      console.log('✅ Search completed:', data)
    })

    searchTools.on('searchError', data => {
      console.error('❌ Search error:', data)
    })
  }

  return searchTools
}

export function addSearchEventListeners() {
  ipcMain.handle(SEARCH_GOOGLE_CHANNEL, async (_event, params: GoogleSearchParams) => {
    try {
      console.log('🔍 Received Google search request in main process:', params.query)

      const tools = initializeSearchTools()

      const result = await tools.google_search({
        query: params.query,
        max_results: params.maxResults || 5,
        country: params.country || 'US',
        language: params.language || 'en'
      })

      if (result.success && result.results) {
        console.log(
          '✅ Google search completed successfully, found',
          result.results.length,
          'results'
        )
        return {
          success: true,
          results: result.results,
          query: params.query,
          timestamp: Date.now()
        }
      } else {
        throw new Error(result.error || 'Search returned no results')
      }
    } catch (error) {
      console.error('❌ Google search error in main process:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown search error',
        query: params.query,
        timestamp: Date.now()
      }
    }
  })

  ipcMain.handle(SEARCH_GEMINI_ANALYZE_CHANNEL, async (_event, params: GeminiAnalyzeParams) => {
    try {
      console.log('🤖 Received Gemini analysis request in main process for query:', params.query)

      const tools = initializeSearchTools()

      // Use Gemini to analyze the search results via summarize_results
      const result = await tools.summarize_results({
        items: params.searchResults as SearchResult[], // Cast to match expected SearchResult type
        question: params.query,
        max_length: 500,
        focus_areas: ['key_insights', 'important_facts', 'summary']
      })

      console.log('✅ Gemini analysis completed successfully')
      return {
        success: true,
        analysis: result,
        query: params.query,
        timestamp: Date.now()
      }
    } catch (error) {
      console.error('❌ Gemini analysis error in main process:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown analysis error',
        query: params.query,
        timestamp: Date.now()
      }
    }
  })
}

// Cleanup function
export function destroySearchTools() {
  if (searchTools) {
    searchTools.destroy()
    searchTools = null
  }
}
