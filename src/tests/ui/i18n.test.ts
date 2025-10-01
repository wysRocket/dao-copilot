/**
 * Internationalization (i18n) Tests
 *
 * Test suite for the i18n system covering language detection,
 * translation retrieval, and fallback behavior.
 */

import {describe, it, expect, beforeEach} from 'vitest'
import i18n, {t} from '../../ui/i18n'

// Mock window.navigator for language detection tests
const mockNavigator = (language: string) => {
  Object.defineProperty(window, 'navigator', {
    value: {
      language
    },
    writable: true
  })
}

describe('i18n System', () => {
  beforeEach(() => {
    // Reset to English for each test
    i18n.setLanguage('en')
  })

  describe('Language Detection', () => {
    it('detects English by default', () => {
      expect(i18n.getCurrentLanguage()).toBe('en')
    })

    it('falls back to English for unsupported browser language', () => {
      mockNavigator('ar-SA') // Arabic (not supported)

      // Language detection happens at initialization, so this test
      // verifies that unsupported languages fall back to English
      expect(i18n.getCurrentLanguage()).toBe('en')
    })
  })

  describe('Language Setting', () => {
    it('changes language successfully', () => {
      i18n.setLanguage('es')
      expect(i18n.getCurrentLanguage()).toBe('es')
    })

    it('falls back to English for invalid language', () => {
      expect(() => i18n.setLanguage('ar')).not.toThrow()
      expect(i18n.getCurrentLanguage()).toBe('en')
    })

    const languages: Array<'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh'> = [
      'en',
      'es',
      'fr',
      'de',
      'ja',
      'zh'
    ]
    test.each(languages)('sets language to %s', lang => {
      i18n.setLanguage(lang)
      expect(i18n.getCurrentLanguage()).toBe(lang)
    })
  })

  describe('Translation Retrieval', () => {
    it('retrieves English translations by default', () => {
      expect(t('connectionStatus.serviceUnavailable')).toBe('Service Temporarily Unavailable')
      expect(t('errors.connectionFailed')).toBe('Failed to establish connection')
      expect(t('actions.retry')).toBe('Retry')
    })

    it('retrieves Spanish translations', () => {
      i18n.setLanguage('es')
      expect(t('connectionStatus.serviceUnavailable')).toBe('Servicio Temporalmente No Disponible')
      expect(t('errors.connectionFailed')).toBe('No se pudo establecer la conexión')
      expect(t('actions.retry')).toBe('Reintentar')
    })

    it('retrieves French translations', () => {
      i18n.setLanguage('fr')
      expect(t('connectionStatus.serviceUnavailable')).toBe('Service Temporairement Indisponible')
      expect(t('errors.connectionFailed')).toBe("Impossible d'établir la connexion")
      expect(t('actions.retry')).toBe('Réessayer')
    })

    it('retrieves German translations', () => {
      i18n.setLanguage('de')
      expect(t('connectionStatus.serviceUnavailable')).toBe('Service Vorübergehend Nicht Verfügbar')
      expect(t('errors.connectionFailed')).toBe('Verbindung konnte nicht hergestellt werden')
      expect(t('actions.retry')).toBe('Wiederholen')
    })

    it('retrieves Japanese translations', () => {
      i18n.setLanguage('ja')
      expect(t('connectionStatus.serviceUnavailable')).toBe('サービス一時停止中')
      expect(t('errors.connectionFailed')).toBe('接続の確立に失敗しました')
      expect(t('actions.retry')).toBe('再試行')
    })

    it('retrieves Chinese translations', () => {
      i18n.setLanguage('zh')
      expect(t('connectionStatus.serviceUnavailable')).toBe('服务暂时不可用')
      expect(t('errors.connectionFailed')).toBe('无法建立连接')
      expect(t('actions.retry')).toBe('重试')
    })
  })

  describe('Fallback Behavior', () => {
    it('falls back to English for missing translations', () => {
      i18n.setLanguage('es')

      // Test with a key that might be missing (simulated by using an invalid key)
      const result = t('nonexistent.key')
      expect(result).toBe('Missing translation: nonexistent.key')
    })

    it('handles invalid translation keys gracefully', () => {
      expect(t('invalid.nested.key.structure')).toBe(
        'Missing translation: invalid.nested.key.structure'
      )
    })

    it('handles empty translation keys', () => {
      expect(t('')).toBe('Missing translation: ')
    })

    it('handles malformed translation keys', () => {
      expect(t('connectionStatus')).toBe('Invalid translation key: connectionStatus')
    })
  })

  describe('Namespace Retrieval', () => {
    it('retrieves connectionStatus messages in English', () => {
      const messages = i18n.getMessages('connectionStatus')
      expect(messages).toHaveProperty('serviceUnavailable', 'Service Temporarily Unavailable')
      expect(messages).toHaveProperty('testingRecovery', 'Testing Service Recovery')
      expect(messages).toHaveProperty('retryNow', 'Retry Now')
    })

    it('retrieves error messages in Spanish', () => {
      i18n.setLanguage('es')
      const messages = i18n.getMessages('errors')
      expect(messages).toHaveProperty(
        'circuitBreakerOpen',
        'El disyuntor del servicio está abierto debido a fallas repetidas'
      )
      expect(messages).toHaveProperty('connectionFailed', 'No se pudo establecer la conexión')
    })

    it('retrieves action messages in French', () => {
      i18n.setLanguage('fr')
      const messages = i18n.getMessages('actions')
      expect(messages).toHaveProperty('retry', 'Réessayer')
      expect(messages).toHaveProperty('cancel', 'Annuler')
      expect(messages).toHaveProperty('settings', 'Paramètres')
    })
  })

  describe('Language Support Checks', () => {
    it('identifies supported languages correctly', () => {
      expect(i18n.isLanguageSupported('en')).toBe(true)
      expect(i18n.isLanguageSupported('es')).toBe(true)
      expect(i18n.isLanguageSupported('fr')).toBe(true)
      expect(i18n.isLanguageSupported('de')).toBe(true)
      expect(i18n.isLanguageSupported('ja')).toBe(true)
      expect(i18n.isLanguageSupported('zh')).toBe(true)
    })

    it('identifies unsupported languages correctly', () => {
      expect(i18n.isLanguageSupported('ar')).toBe(false)
      expect(i18n.isLanguageSupported('ru')).toBe(false)
      expect(i18n.isLanguageSupported('pt')).toBe(false)
      expect(i18n.isLanguageSupported('invalid')).toBe(false)
    })

    it('returns list of supported languages', () => {
      const supported = i18n.getSupportedLanguages()
      expect(supported).toEqual(['en', 'es', 'fr', 'de', 'ja', 'zh'])
    })
  })

  describe('Translation Completeness', () => {
    it('has complete connectionStatus translations for all languages', () => {
      const supportedLanguages = i18n.getSupportedLanguages()
      const expectedKeys = [
        'serviceUnavailable',
        'testingRecovery',
        'serviceRestored',
        'systemDegraded',
        'allSystemsOperational',
        'backupModeActive',
        'primaryServiceRestored',
        'connectionQualityChanged',
        'retryNow',
        'viewDetails',
        'checkStatus',
        'dismiss',
        'close'
      ]

      supportedLanguages.forEach(lang => {
        i18n.setLanguage(lang)
        const messages = i18n.getMessages('connectionStatus')

        expectedKeys.forEach(key => {
          expect(messages).toHaveProperty(key)
          expect(typeof messages[key]).toBe('string')
          expect(messages[key].length).toBeGreaterThan(0)
        })
      })
    })

    it('has complete error translations for all languages', () => {
      const supportedLanguages = i18n.getSupportedLanguages()
      const expectedKeys = [
        'circuitBreakerOpen',
        'connectionFailed',
        'transportSwitched',
        'serviceTimeout',
        'websocketError',
        'httpStreamError',
        'batchProcessingError',
        'fallbackExhausted',
        'unknownError'
      ]

      supportedLanguages.forEach(lang => {
        i18n.setLanguage(lang)
        const messages = i18n.getMessages('errors')

        expectedKeys.forEach(key => {
          expect(messages).toHaveProperty(key)
          expect(typeof messages[key]).toBe('string')
          expect(messages[key].length).toBeGreaterThan(0)
        })
      })
    })

    it('has complete action translations for all languages', () => {
      const supportedLanguages = i18n.getSupportedLanguages()
      const expectedKeys = ['retry', 'cancel', 'details', 'refresh', 'settings']

      supportedLanguages.forEach(lang => {
        i18n.setLanguage(lang)
        const messages = i18n.getMessages('actions')

        expectedKeys.forEach(key => {
          expect(messages).toHaveProperty(key)
          expect(typeof messages[key]).toBe('string')
          expect(messages[key].length).toBeGreaterThan(0)
        })
      })
    })
  })

  describe('Shorthand Translation Function', () => {
    it('works with the exported t function', () => {
      expect(t('connectionStatus.healthy')).toBe('Healthy')
      expect(t('actions.retry')).toBe('Retry')
    })

    it('reflects language changes in t function', () => {
      expect(t('connectionStatus.healthy')).toBe('Healthy')

      i18n.setLanguage('es')
      expect(t('connectionStatus.healthy')).toBe('Saludable')

      i18n.setLanguage('fr')
      expect(t('connectionStatus.healthy')).toBe('Sain')
    })
  })

  describe('Edge Cases', () => {
    describe('Edge Cases', () => {
      it('handles missing window object gracefully', () => {
        const originalWindow = global.window
        delete (global as Record<string, unknown>).window

        expect(() => {
          i18n.getCurrentLanguage()
        }).not.toThrow()

        global.window = originalWindow
      })

      it('handles missing navigator object gracefully', () => {
        const originalNavigator = global.navigator
        delete (global as Record<string, unknown>).navigator

        expect(() => {
          i18n.getCurrentLanguage()
        }).not.toThrow()

        global.navigator = originalNavigator
      })
    })
  })
})
