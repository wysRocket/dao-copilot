/**
 * Simple Internationalization System
 *
 * Provides basic i18n support for connection status messages and error text.
 * Supports multiple languages with fallback to English.
 */

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh'

export interface I18nMessages {
  connectionStatus: {
    serviceUnavailable: string
    testingRecovery: string
    serviceRestored: string
    systemDegraded: string
    allSystemsOperational: string
    backupModeActive: string
    primaryServiceRestored: string
    connectionQualityChanged: string
    retryNow: string
    viewDetails: string
    checkStatus: string
    dismiss: string
    close: string
    systemStatusIndicator: string
    healthy: string
    degraded: string
    warning: string
    error: string
    unknown: string
    allSystemsOp: string
    someServicesDegraded: string
    serviceIssuesDetected: string
    criticalServiceErrors: string
    statusUnknown: string
    usingBackupServices: string
    autoRecovered: string
    lastUpdated: string
  }
  errors: {
    circuitBreakerOpen: string
    connectionFailed: string
    transportSwitched: string
    serviceTimeout: string
    websocketError: string
    httpStreamError: string
    batchProcessingError: string
    fallbackExhausted: string
    unknownError: string
  }
  actions: {
    retry: string
    cancel: string
    details: string
    refresh: string
    settings: string
  }
}

const MESSAGES: Record<SupportedLanguage, I18nMessages> = {
  en: {
    connectionStatus: {
      serviceUnavailable: 'Service Temporarily Unavailable',
      testingRecovery: 'Testing Service Recovery',
      serviceRestored: 'Service Restored',
      systemDegraded: 'System Performance Degraded',
      allSystemsOperational: 'All Systems Operational',
      backupModeActive: 'Backup Mode Active',
      primaryServiceRestored: 'Primary Service Restored',
      connectionQualityChanged: 'Connection Quality Changed',
      retryNow: 'Retry Now',
      viewDetails: 'View Details',
      checkStatus: 'Check Status',
      dismiss: 'Dismiss',
      close: 'Close',
      systemStatusIndicator: 'System status indicator',
      healthy: 'Healthy',
      degraded: 'Degraded',
      warning: 'Warning',
      error: 'Error',
      unknown: 'Unknown',
      allSystemsOp: 'All systems operational',
      someServicesDegraded: 'Some services degraded',
      serviceIssuesDetected: 'Service issues detected',
      criticalServiceErrors: 'Critical service errors',
      statusUnknown: 'Status unknown',
      usingBackupServices: 'Using backup services',
      autoRecovered: 'Auto-recovered after no recent issues',
      lastUpdated: 'Last updated'
    },
    errors: {
      circuitBreakerOpen: 'Service circuit breaker is open due to repeated failures',
      connectionFailed: 'Failed to establish connection',
      transportSwitched: 'Switched to alternative transport method',
      serviceTimeout: 'Service request timed out',
      websocketError: 'WebSocket connection error',
      httpStreamError: 'HTTP streaming error',
      batchProcessingError: 'Batch processing failed',
      fallbackExhausted: 'All fallback options have been exhausted',
      unknownError: 'An unknown error occurred'
    },
    actions: {
      retry: 'Retry',
      cancel: 'Cancel',
      details: 'Details',
      refresh: 'Refresh',
      settings: 'Settings'
    }
  },
  es: {
    connectionStatus: {
      serviceUnavailable: 'Servicio Temporalmente No Disponible',
      testingRecovery: 'Probando Recuperación del Servicio',
      serviceRestored: 'Servicio Restaurado',
      systemDegraded: 'Rendimiento del Sistema Degradado',
      allSystemsOperational: 'Todos los Sistemas Operacionales',
      backupModeActive: 'Modo de Respaldo Activo',
      primaryServiceRestored: 'Servicio Principal Restaurado',
      connectionQualityChanged: 'Calidad de Conexión Cambiada',
      retryNow: 'Reintentar Ahora',
      viewDetails: 'Ver Detalles',
      checkStatus: 'Verificar Estado',
      dismiss: 'Descartar',
      close: 'Cerrar',
      systemStatusIndicator: 'Indicador de estado del sistema',
      healthy: 'Saludable',
      degraded: 'Degradado',
      warning: 'Advertencia',
      error: 'Error',
      unknown: 'Desconocido',
      allSystemsOp: 'Todos los sistemas operacionales',
      someServicesDegraded: 'Algunos servicios degradados',
      serviceIssuesDetected: 'Problemas de servicio detectados',
      criticalServiceErrors: 'Errores críticos del servicio',
      statusUnknown: 'Estado desconocido',
      usingBackupServices: 'Usando servicios de respaldo',
      autoRecovered: 'Auto-recuperado después de no tener problemas recientes',
      lastUpdated: 'Última actualización'
    },
    errors: {
      circuitBreakerOpen: 'El disyuntor del servicio está abierto debido a fallas repetidas',
      connectionFailed: 'No se pudo establecer la conexión',
      transportSwitched: 'Cambiado a método de transporte alternativo',
      serviceTimeout: 'La solicitud del servicio expiró',
      websocketError: 'Error de conexión WebSocket',
      httpStreamError: 'Error de transmisión HTTP',
      batchProcessingError: 'Falló el procesamiento por lotes',
      fallbackExhausted: 'Se han agotado todas las opciones de respaldo',
      unknownError: 'Ocurrió un error desconocido'
    },
    actions: {
      retry: 'Reintentar',
      cancel: 'Cancelar',
      details: 'Detalles',
      refresh: 'Actualizar',
      settings: 'Configuración'
    }
  },
  fr: {
    connectionStatus: {
      serviceUnavailable: 'Service Temporairement Indisponible',
      testingRecovery: 'Test de Récupération du Service',
      serviceRestored: 'Service Restauré',
      systemDegraded: 'Performance Système Dégradée',
      allSystemsOperational: 'Tous les Systèmes Opérationnels',
      backupModeActive: 'Mode de Sauvegarde Actif',
      primaryServiceRestored: 'Service Principal Restauré',
      connectionQualityChanged: 'Qualité de Connexion Modifiée',
      retryNow: 'Réessayer Maintenant',
      viewDetails: 'Voir les Détails',
      checkStatus: 'Vérifier le Statut',
      dismiss: 'Ignorer',
      close: 'Fermer',
      systemStatusIndicator: "Indicateur d'état du système",
      healthy: 'Sain',
      degraded: 'Dégradé',
      warning: 'Avertissement',
      error: 'Erreur',
      unknown: 'Inconnu',
      allSystemsOp: 'Tous les systèmes opérationnels',
      someServicesDegraded: 'Certains services dégradés',
      serviceIssuesDetected: 'Problèmes de service détectés',
      criticalServiceErrors: 'Erreurs critiques du service',
      statusUnknown: 'Statut inconnu',
      usingBackupServices: 'Utilisation des services de sauvegarde',
      autoRecovered: 'Auto-récupéré après aucun problème récent',
      lastUpdated: 'Dernière mise à jour'
    },
    errors: {
      circuitBreakerOpen: "Le disjoncteur de service est ouvert en raison d'échecs répétés",
      connectionFailed: "Impossible d'établir la connexion",
      transportSwitched: 'Basculé vers une méthode de transport alternative',
      serviceTimeout: 'La demande de service a expiré',
      websocketError: 'Erreur de connexion WebSocket',
      httpStreamError: 'Erreur de streaming HTTP',
      batchProcessingError: 'Échec du traitement par lots',
      fallbackExhausted: 'Toutes les options de secours ont été épuisées',
      unknownError: "Une erreur inconnue s'est produite"
    },
    actions: {
      retry: 'Réessayer',
      cancel: 'Annuler',
      details: 'Détails',
      refresh: 'Actualiser',
      settings: 'Paramètres'
    }
  },
  de: {
    connectionStatus: {
      serviceUnavailable: 'Service Vorübergehend Nicht Verfügbar',
      testingRecovery: 'Service-Wiederherstellung Testen',
      serviceRestored: 'Service Wiederhergestellt',
      systemDegraded: 'System-Leistung Beeinträchtigt',
      allSystemsOperational: 'Alle Systeme Betriebsbereit',
      backupModeActive: 'Backup-Modus Aktiv',
      primaryServiceRestored: 'Primärer Service Wiederhergestellt',
      connectionQualityChanged: 'Verbindungsqualität Geändert',
      retryNow: 'Jetzt Wiederholen',
      viewDetails: 'Details Anzeigen',
      checkStatus: 'Status Prüfen',
      dismiss: 'Verwerfen',
      close: 'Schließen',
      systemStatusIndicator: 'System-Statusanzeige',
      healthy: 'Gesund',
      degraded: 'Beeinträchtigt',
      warning: 'Warnung',
      error: 'Fehler',
      unknown: 'Unbekannt',
      allSystemsOp: 'Alle Systeme betriebsbereit',
      someServicesDegraded: 'Einige Services beeinträchtigt',
      serviceIssuesDetected: 'Service-Probleme erkannt',
      criticalServiceErrors: 'Kritische Service-Fehler',
      statusUnknown: 'Status unbekannt',
      usingBackupServices: 'Backup-Services verwenden',
      autoRecovered: 'Auto-wiederhergestellt nach keinen aktuellen Problemen',
      lastUpdated: 'Zuletzt aktualisiert'
    },
    errors: {
      circuitBreakerOpen: 'Service-Schutzschalter ist aufgrund wiederholter Fehler geöffnet',
      connectionFailed: 'Verbindung konnte nicht hergestellt werden',
      transportSwitched: 'Zu alternativer Transportmethode gewechselt',
      serviceTimeout: 'Service-Anfrage ist abgelaufen',
      websocketError: 'WebSocket-Verbindungsfehler',
      httpStreamError: 'HTTP-Streaming-Fehler',
      batchProcessingError: 'Stapelverarbeitung fehlgeschlagen',
      fallbackExhausted: 'Alle Ausweichmöglichkeiten sind erschöpft',
      unknownError: 'Ein unbekannter Fehler ist aufgetreten'
    },
    actions: {
      retry: 'Wiederholen',
      cancel: 'Abbrechen',
      details: 'Details',
      refresh: 'Aktualisieren',
      settings: 'Einstellungen'
    }
  },
  ja: {
    connectionStatus: {
      serviceUnavailable: 'サービス一時停止中',
      testingRecovery: 'サービス復旧テスト中',
      serviceRestored: 'サービス復旧完了',
      systemDegraded: 'システム性能低下',
      allSystemsOperational: '全システム正常稼働',
      backupModeActive: 'バックアップモード稼働中',
      primaryServiceRestored: 'メインサービス復旧完了',
      connectionQualityChanged: '接続品質が変更されました',
      retryNow: '今すぐ再試行',
      viewDetails: '詳細を見る',
      checkStatus: 'ステータス確認',
      dismiss: '閉じる',
      close: '閉じる',
      systemStatusIndicator: 'システムステータス表示',
      healthy: '正常',
      degraded: '低下',
      warning: '警告',
      error: 'エラー',
      unknown: '不明',
      allSystemsOp: '全システム正常稼働',
      someServicesDegraded: '一部サービス低下',
      serviceIssuesDetected: 'サービス問題検出',
      criticalServiceErrors: '重要サービスエラー',
      statusUnknown: 'ステータス不明',
      usingBackupServices: 'バックアップサービス使用中',
      autoRecovered: '最近の問題なしで自動復旧',
      lastUpdated: '最終更新'
    },
    errors: {
      circuitBreakerOpen: '連続的な障害によりサービスサーキットブレーカーが開いています',
      connectionFailed: '接続の確立に失敗しました',
      transportSwitched: '代替転送方式に切り替えました',
      serviceTimeout: 'サービスリクエストがタイムアウトしました',
      websocketError: 'WebSocket接続エラー',
      httpStreamError: 'HTTPストリーミングエラー',
      batchProcessingError: 'バッチ処理が失敗しました',
      fallbackExhausted: 'すべてのフォールバックオプションが使い果たされました',
      unknownError: '不明なエラーが発生しました'
    },
    actions: {
      retry: '再試行',
      cancel: 'キャンセル',
      details: '詳細',
      refresh: '更新',
      settings: '設定'
    }
  },
  zh: {
    connectionStatus: {
      serviceUnavailable: '服务暂时不可用',
      testingRecovery: '正在测试服务恢复',
      serviceRestored: '服务已恢复',
      systemDegraded: '系统性能下降',
      allSystemsOperational: '所有系统正常运行',
      backupModeActive: '备份模式激活',
      primaryServiceRestored: '主服务已恢复',
      connectionQualityChanged: '连接质量已更改',
      retryNow: '立即重试',
      viewDetails: '查看详情',
      checkStatus: '检查状态',
      dismiss: '关闭',
      close: '关闭',
      systemStatusIndicator: '系统状态指示器',
      healthy: '正常',
      degraded: '降级',
      warning: '警告',
      error: '错误',
      unknown: '未知',
      allSystemsOp: '所有系统正常运行',
      someServicesDegraded: '部分服务降级',
      serviceIssuesDetected: '检测到服务问题',
      criticalServiceErrors: '关键服务错误',
      statusUnknown: '状态未知',
      usingBackupServices: '使用备份服务',
      autoRecovered: '在没有近期问题后自动恢复',
      lastUpdated: '最后更新'
    },
    errors: {
      circuitBreakerOpen: '由于重复故障，服务断路器处于开启状态',
      connectionFailed: '无法建立连接',
      transportSwitched: '已切换到备用传输方式',
      serviceTimeout: '服务请求超时',
      websocketError: 'WebSocket连接错误',
      httpStreamError: 'HTTP流错误',
      batchProcessingError: '批处理失败',
      fallbackExhausted: '所有后备选项已用尽',
      unknownError: '发生未知错误'
    },
    actions: {
      retry: '重试',
      cancel: '取消',
      details: '详情',
      refresh: '刷新',
      settings: '设置'
    }
  }
}

class I18nManager {
  private currentLanguage: SupportedLanguage = 'en'

  constructor() {
    // Try to detect user language from browser
    this.detectLanguage()
  }

  private detectLanguage(): void {
    if (typeof window !== 'undefined' && window.navigator) {
      const browserLang = window.navigator.language.slice(0, 2) as SupportedLanguage
      if (browserLang in MESSAGES) {
        this.currentLanguage = browserLang
      }
    }
  }

  setLanguage(language: SupportedLanguage): void {
    if (language in MESSAGES) {
      this.currentLanguage = language
    }
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage
  }

  t(key: string): string {
    const keys = key.split('.')
    let current: I18nMessages | I18nMessages[keyof I18nMessages] | string =
      MESSAGES[this.currentLanguage]

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k as keyof typeof current]
      } else {
        // Fallback to English if key not found
        current = MESSAGES.en
        for (const fallbackKey of keys) {
          if (current && typeof current === 'object' && fallbackKey in current) {
            current = current[fallbackKey as keyof typeof current]
          } else {
            return `Missing translation: ${key}`
          }
        }
        break
      }
    }

    return typeof current === 'string' ? current : `Invalid translation key: ${key}`
  }

  // Helper method to get all messages for a specific namespace
  getMessages(namespace: keyof I18nMessages): Record<string, string> {
    return MESSAGES[this.currentLanguage][namespace]
  }

  // Check if a language is supported
  isLanguageSupported(language: string): language is SupportedLanguage {
    return language in MESSAGES
  }

  // Get list of supported languages
  getSupportedLanguages(): SupportedLanguage[] {
    return Object.keys(MESSAGES) as SupportedLanguage[]
  }
}

// Export singleton instance
export const i18n = new I18nManager()

// Export helper function for easy access
export const t = (key: string): string => i18n.t(key)

// Export type for component props
export type TranslationKey =
  | `connectionStatus.${keyof I18nMessages['connectionStatus']}`
  | `errors.${keyof I18nMessages['errors']}`
  | `actions.${keyof I18nMessages['actions']}`

export default i18n
