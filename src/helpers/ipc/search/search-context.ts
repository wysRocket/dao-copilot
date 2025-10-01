import {contextBridge, ipcRenderer} from 'electron'
import {SEARCH_GOOGLE_CHANNEL, SEARCH_GEMINI_ANALYZE_CHANNEL} from './search-channels'

export interface GoogleSearchParams {
  query: string
  maxResults?: number
  country?: string
  language?: string
}

export interface GeminiAnalyzeParams {
  query: string
  searchResults: unknown[]
}

export function exposeSearchContext() {
  try {
    const globalWindow = window as unknown as Record<string, unknown>
    if (!globalWindow.searchAPI) {
      contextBridge.exposeInMainWorld('searchAPI', {
        googleSearch: (params: GoogleSearchParams) =>
          ipcRenderer.invoke(SEARCH_GOOGLE_CHANNEL, params),
        geminiAnalyze: (params: GeminiAnalyzeParams) =>
          ipcRenderer.invoke(SEARCH_GEMINI_ANALYZE_CHANNEL, params)
      })
    }
  } catch (error) {
    console.error('Error exposing search context:', error)
  }
}
