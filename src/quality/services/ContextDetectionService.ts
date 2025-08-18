/**
 * Context Detection Service
 *
 * Gathers contextual information for language detection including:
 * - Browser/system language settings
 * - Geographic location data
 * - Session history and preferences
 * - Application context and user behavior
 */

import {
  ContextLanguageFeatures,
  ApplicationContext,
  SessionContext,
  GeographicContext
} from '../types/LanguageTypes'

/**
 * Service to gather contextual information for language detection
 */
export class ContextDetectionService {
  private sessionData: SessionContext = {
    previousLanguages: [],
    userPreferences: {},
    sessionDuration: 0
  }

  private cache = new Map<string, any>()
  private cacheTimeout = 5 * 60 * 1000 // 5 minutes

  /**
   * Gather comprehensive context information
   */
  public async gatherContext(): Promise<ContextLanguageFeatures> {
    const [applicationContext, geographicContext] = await Promise.all([
      this.getApplicationContext(),
      this.getGeographicContext()
    ])

    return {
      applicationContext,
      sessionContext: this.getSessionContext(),
      geographicContext
    }
  }

  /**
   * Get application-level context information
   */
  public async getApplicationContext(): Promise<ApplicationContext> {
    const cacheKey = 'app_context'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    const context: ApplicationContext = {
      browserLanguage: this.getBrowserLanguage(),
      systemLocale: this.getSystemLocale(),
      timeZone: this.getTimeZone(),
      platformInfo: this.getPlatformInfo(),
      uiLanguage: this.getUILanguage()
    }

    this.setCached(cacheKey, context)
    return context
  }

  /**
   * Get session-specific context information
   */
  public getSessionContext(): SessionContext {
    return {
      ...this.sessionData,
      sessionDuration: Date.now() - (this.sessionData.sessionStartTime || Date.now())
    }
  }

  /**
   * Get geographic context information
   */
  public async getGeographicContext(): Promise<GeographicContext> {
    const cacheKey = 'geo_context'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    const context: GeographicContext = {
      country: await this.getCountryCode(),
      region: await this.getRegion(),
      timezone: this.getTimeZone()
    }

    this.setCached(cacheKey, context)
    return context
  }

  /**
   * Update session context with new language detection
   */
  public updateSessionContext(language: string, confidence: number): void {
    if (!this.sessionData.sessionStartTime) {
      this.sessionData.sessionStartTime = Date.now()
    }

    // Add to previous languages (keep last 10)
    this.sessionData.previousLanguages.unshift(language)
    if (this.sessionData.previousLanguages.length > 10) {
      this.sessionData.previousLanguages = this.sessionData.previousLanguages.slice(0, 10)
    }

    // Update user preferences based on consistent language usage
    if (!this.sessionData.userPreferences.preferredLanguages) {
      this.sessionData.userPreferences.preferredLanguages = []
    }

    const langCount = this.sessionData.previousLanguages.filter(l => l === language).length
    if (langCount >= 3 && confidence > 0.8) {
      const preferred = this.sessionData.userPreferences.preferredLanguages
      if (!preferred.includes(language)) {
        preferred.push(language)
      }
    }
  }

  /**
   * Set user language preference
   */
  public setUserPreference(language: string, domain?: string): void {
    if (!this.sessionData.userPreferences.preferredLanguages) {
      this.sessionData.userPreferences.preferredLanguages = []
    }

    if (!this.sessionData.userPreferences.preferredLanguages.includes(language)) {
      this.sessionData.userPreferences.preferredLanguages.unshift(language)
    }

    if (domain) {
      if (!this.sessionData.userPreferences.domainPreferences) {
        this.sessionData.userPreferences.domainPreferences = {}
      }
      this.sessionData.userPreferences.domainPreferences[domain] = language
    }

    // Persist to localStorage if available
    this.persistUserPreferences()
  }

  /**
   * Get language suggestions based on context
   */
  public getLanguageSuggestions(): string[] {
    const suggestions = new Set<string>()

    // Browser/system language
    const browserLang = this.getBrowserLanguage()
    if (browserLang) suggestions.add(browserLang)

    // System locale
    const systemLang = this.getSystemLocale()?.split('-')[0]
    if (systemLang) suggestions.add(systemLang)

    // User preferences
    const preferred = this.sessionData.userPreferences.preferredLanguages || []
    preferred.forEach(lang => suggestions.add(lang))

    // Recent session languages
    this.sessionData.previousLanguages.slice(0, 3).forEach(lang => suggestions.add(lang))

    return Array.from(suggestions)
  }

  /**
   * Clear session data
   */
  public clearSession(): void {
    this.sessionData = {
      previousLanguages: [],
      userPreferences: this.sessionData.userPreferences, // Keep user preferences
      sessionDuration: 0
    }
  }

  /**
   * Initialize context service with stored preferences
   */
  public async initialize(): Promise<void> {
    await this.loadUserPreferences()

    // Set initial session start time
    if (!this.sessionData.sessionStartTime) {
      this.sessionData.sessionStartTime = Date.now()
    }
  }

  // Private helper methods

  private getBrowserLanguage(): string {
    if (typeof navigator === 'undefined') return 'en'

    // Try various browser language properties
    const language = navigator.language || (navigator.languages && navigator.languages[0]) || 'en'

    return language.split('-')[0].toLowerCase()
  }

  private getSystemLocale(): string | undefined {
    if (typeof navigator === 'undefined') return undefined

    // Try to get system locale
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale
    } catch {
      return navigator.language
    }
  }

  private getTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return 'UTC'
    }
  }

  private getPlatformInfo(): ApplicationContext['platformInfo'] {
    if (typeof navigator === 'undefined') {
      return {
        platform: 'unknown',
        userAgent: '',
        vendor: ''
      }
    }

    return {
      platform: navigator.platform || 'unknown',
      userAgent: navigator.userAgent || '',
      vendor: navigator.vendor || ''
    }
  }

  private getUILanguage(): string {
    // Try to detect UI language from various sources
    if (typeof document !== 'undefined') {
      const htmlLang = document.documentElement.lang
      if (htmlLang) return htmlLang.split('-')[0].toLowerCase()
    }

    return this.getBrowserLanguage()
  }

  private async getCountryCode(): Promise<string | undefined> {
    try {
      // Try to get country from timezone
      const timeZone = this.getTimeZone()
      const countryFromTZ = this.extractCountryFromTimezone(timeZone)
      if (countryFromTZ) return countryFromTZ

      // Try to get country from locale
      const locale = this.getSystemLocale()
      if (locale && locale.includes('-')) {
        const parts = locale.split('-')
        if (parts.length > 1 && parts[1].length === 2) {
          return parts[1].toUpperCase()
        }
      }

      // Fallback: try geolocation API (with permission)
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const position = await this.getCurrentPosition()
          return await this.geocodePosition(position)
        } catch {
          // Geolocation failed, continue with other methods
        }
      }

      return undefined
    } catch {
      return undefined
    }
  }

  private async getRegion(): Promise<string | undefined> {
    try {
      const timeZone = this.getTimeZone()
      // Extract region from timezone (e.g., "America/New_York" -> "America")
      if (timeZone.includes('/')) {
        return timeZone.split('/')[0]
      }
      return undefined
    } catch {
      return undefined
    }
  }

  private extractCountryFromTimezone(timeZone: string): string | undefined {
    // Map common timezones to countries
    const timezoneCountryMap: Record<string, string> = {
      'America/New_York': 'US',
      'America/Chicago': 'US',
      'America/Denver': 'US',
      'America/Los_Angeles': 'US',
      'Europe/London': 'GB',
      'Europe/Paris': 'FR',
      'Europe/Berlin': 'DE',
      'Europe/Madrid': 'ES',
      'Europe/Rome': 'IT',
      'Europe/Amsterdam': 'NL',
      'Europe/Kiev': 'UA',
      'Europe/Moscow': 'RU',
      'Asia/Tokyo': 'JP',
      'Asia/Shanghai': 'CN',
      'Asia/Seoul': 'KR',
      'Australia/Sydney': 'AU',
      'Australia/Melbourne': 'AU'
    }

    return timezoneCountryMap[timeZone]
  }

  private getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 5000,
        enableHighAccuracy: false
      })
    })
  }

  private async geocodePosition(position: GeolocationPosition): Promise<string | undefined> {
    // In a real implementation, you would use a geocoding service
    // For now, return undefined as we don't want to make external API calls
    return undefined
  }

  private getCached(key: string): any {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  private setCached(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  private persistUserPreferences(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'languageDetection_userPreferences',
          JSON.stringify(this.sessionData.userPreferences)
        )
      }
    } catch {
      // localStorage not available or quota exceeded
    }
  }

  private async loadUserPreferences(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('languageDetection_userPreferences')
        if (stored) {
          const preferences = JSON.parse(stored)
          this.sessionData.userPreferences = {...preferences}
        }
      }
    } catch {
      // localStorage not available or invalid data
      this.sessionData.userPreferences = {}
    }
  }
}
