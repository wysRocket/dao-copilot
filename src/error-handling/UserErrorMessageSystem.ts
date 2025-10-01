import {EventEmitter} from 'events'

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Error categories
 */
export type ErrorCategory =
  | 'transcription'
  | 'audio'
  | 'network'
  | 'api'
  | 'system'
  | 'authentication'
  | 'rate-limit'

/**
 * Classified error information
 */
export interface ClassifiedError {
  type: string
  category: ErrorCategory
  severity: ErrorSeverity
  message: string
  timestamp: number
}

/**
 * Error context information
 */
export interface ErrorContext {
  component: string
  operation: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

/**
 * Supported locales for error messages
 */
export type SupportedLocale = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko'

/**
 * Error message template with placeholder support
 */
export interface ErrorMessageTemplate {
  /** Template ID for reference */
  id: string
  /** Template content with placeholders */
  template: string
  /** Severity level for this message */
  severity: ErrorSeverity
  /** Category this template applies to */
  category: ErrorCategory
  /** Whether this message requires user action */
  actionRequired: boolean
  /** Suggested actions for the user */
  suggestedActions?: string[]
  /** Help documentation links */
  helpLinks?: Array<{
    text: string
    url: string
  }>
}

/**
 * Localized error message content
 */
export interface LocalizedErrorMessage {
  /** Primary error message */
  message: string
  /** Technical details (optional, for advanced users) */
  technicalDetails?: string
  /** User-friendly description */
  description?: string
  /** Suggested actions the user can take */
  suggestedActions: string[]
  /** Help links for more information */
  helpLinks: Array<{
    text: string
    url: string
  }>
  /** Whether immediate action is required */
  actionRequired: boolean
  /** Unique identifier for this error occurrence */
  errorId: string
  /** Timestamp of the error */
  timestamp: number
  /** Severity level */
  severity: ErrorSeverity
}

/**
 * User-facing error display options
 */
export interface ErrorDisplayOptions {
  /** Show technical details */
  showTechnicalDetails: boolean
  /** Maximum length for error messages */
  maxMessageLength: number
  /** Include suggested actions */
  includeSuggestedActions: boolean
  /** Include help links */
  includeHelpLinks: boolean
  /** Preferred locale */
  locale: SupportedLocale
  /** User's technical proficiency level */
  userLevel: 'basic' | 'intermediate' | 'advanced'
}

/**
 * Configuration for the user error message system
 */
export interface UserErrorMessageConfig {
  /** Default locale */
  defaultLocale: SupportedLocale
  /** Default display options */
  defaultDisplayOptions: ErrorDisplayOptions
  /** Enable message analytics */
  enableAnalytics: boolean
  /** Custom message templates */
  customTemplates?: Record<string, ErrorMessageTemplate>
  /** Maximum number of cached messages */
  maxCachedMessages: number
  /** Enable automatic message dismissal */
  enableAutoDismissal: boolean
  /** Auto-dismissal timeout in milliseconds */
  autoDismissalTimeoutMs: number
}

/**
 * Error message analytics data
 */
export interface ErrorMessageAnalytics {
  /** Message display count */
  displayCount: number
  /** User dismissal count */
  dismissalCount: number
  /** Average time to dismissal */
  avgTimeToDismissal: number
  /** Action taken count */
  actionsTaken: number
  /** Help links clicked */
  helpLinksClicked: number
  /** User feedback ratings */
  userRatings: number[]
}

/**
 * Comprehensive user-facing error message system
 */
export class UserErrorMessageSystem extends EventEmitter {
  private readonly config: UserErrorMessageConfig
  private readonly messageTemplates: Map<string, Map<SupportedLocale, ErrorMessageTemplate>>
  private readonly messageCache: Map<string, LocalizedErrorMessage>
  private readonly analytics: Map<string, ErrorMessageAnalytics>
  private readonly activeMessages: Map<string, LocalizedErrorMessage>

  constructor(config?: Partial<UserErrorMessageConfig>) {
    super()

    this.config = {
      defaultLocale: 'en',
      defaultDisplayOptions: {
        showTechnicalDetails: false,
        maxMessageLength: 500,
        includeSuggestedActions: true,
        includeHelpLinks: true,
        locale: 'en',
        userLevel: 'basic'
      },
      enableAnalytics: true,
      maxCachedMessages: 1000,
      enableAutoDismissal: true,
      autoDismissalTimeoutMs: 30000, // 30 seconds
      ...config
    }

    this.messageTemplates = new Map()
    this.messageCache = new Map()
    this.analytics = new Map()
    this.activeMessages = new Map()

    this.initializeDefaultTemplates()
  }

  /**
   * Initialize default error message templates for all categories and locales
   */
  private initializeDefaultTemplates(): void {
    const defaultTemplates: Record<
      string,
      Record<SupportedLocale, Omit<ErrorMessageTemplate, 'id'>>
    > = {
      // Transcription errors
      'transcription.connection_lost': {
        en: {
          template: 'Lost connection to transcription service. Attempting to reconnect...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Please wait while we restore the connection',
            'Check your internet connection'
          ],
          helpLinks: [{text: 'Troubleshooting Guide', url: '/help/connection-issues'}]
        },
        es: {
          template: 'Conexión perdida con el servicio de transcripción. Intentando reconectar...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Espere mientras restauramos la conexión',
            'Verifique su conexión a internet'
          ],
          helpLinks: [{text: 'Guía de Solución de Problemas', url: '/help/connection-issues'}]
        },
        fr: {
          template: 'Connexion perdue au service de transcription. Tentative de reconnexion...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Veuillez patienter pendant que nous restaurons la connexion',
            'Vérifiez votre connexion internet'
          ],
          helpLinks: [{text: 'Guide de Dépannage', url: '/help/connection-issues'}]
        },
        de: {
          template: 'Verbindung zum Transkriptionsdienst verloren. Versuche zu reconnektieren...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Bitte warten Sie, während wir die Verbindung wiederherstellen',
            'Überprüfen Sie Ihre Internetverbindung'
          ],
          helpLinks: [{text: 'Fehlerbehebungsanleitung', url: '/help/connection-issues'}]
        },
        zh: {
          template: '与转录服务的连接丢失。正在尝试重新连接...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: ['请等待我们恢复连接', '检查您的网络连接'],
          helpLinks: [{text: '故障排除指南', url: '/help/connection-issues'}]
        },
        ja: {
          template: '転写サービスへの接続が失われました。再接続を試みています...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            '接続を復元するまでお待ちください',
            'インターネット接続を確認してください'
          ],
          helpLinks: [{text: 'トラブルシューティングガイド', url: '/help/connection-issues'}]
        },
        ko: {
          template: '전사 서비스 연결이 끊어졌습니다. 다시 연결을 시도하고 있습니다...',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: false,
          suggestedActions: ['연결을 복구하는 동안 기다려 주세요', '인터넷 연결을 확인하세요'],
          helpLinks: [{text: '문제 해결 가이드', url: '/help/connection-issues'}]
        }
      },
      'transcription.quality_degraded': {
        en: {
          template: 'Transcription quality has decreased. Audio quality may be poor.',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Check your microphone',
            'Move closer to the audio source',
            'Reduce background noise'
          ],
          helpLinks: [{text: 'Audio Quality Tips', url: '/help/audio-quality'}]
        },
        es: {
          template:
            'La calidad de transcripción ha disminuido. La calidad del audio puede ser deficiente.',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Verifique su micrófono',
            'Acérquese a la fuente de audio',
            'Reduzca el ruido de fondo'
          ],
          helpLinks: [{text: 'Consejos de Calidad de Audio', url: '/help/audio-quality'}]
        },
        fr: {
          template: 'La qualité de transcription a diminué. La qualité audio peut être médiocre.',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Vérifiez votre microphone',
            'Rapprochez-vous de la source audio',
            'Réduisez le bruit de fond'
          ],
          helpLinks: [{text: 'Conseils de Qualité Audio', url: '/help/audio-quality'}]
        },
        de: {
          template:
            'Die Transkriptionsqualität hat sich verschlechtert. Die Audioqualität könnte schlecht sein.',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Überprüfen Sie Ihr Mikrofon',
            'Gehen Sie näher zur Audioquelle',
            'Reduzieren Sie Hintergrundgeräusche'
          ],
          helpLinks: [{text: 'Audio-Qualitätstipps', url: '/help/audio-quality'}]
        },
        zh: {
          template: '转录质量已降低。音频质量可能较差。',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: ['检查您的麦克风', '靠近音频源', '减少背景噪音'],
          helpLinks: [{text: '音频质量提示', url: '/help/audio-quality'}]
        },
        ja: {
          template: '転写品質が低下しました。音声品質が悪い可能性があります。',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'マイクを確認してください',
            '音声ソースに近づいてください',
            '背景ノイズを減らしてください'
          ],
          helpLinks: [{text: '音声品質のヒント', url: '/help/audio-quality'}]
        },
        ko: {
          template: '전사 품질이 저하되었습니다. 오디오 품질이 좋지 않을 수 있습니다.',
          severity: 'medium',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '마이크를 확인하세요',
            '오디오 소스에 가까이 가세요',
            '배경 소음을 줄이세요'
          ],
          helpLinks: [{text: '오디오 품질 팁', url: '/help/audio-quality'}]
        }
      },
      'transcription.processing_failed': {
        en: {
          template: 'Failed to process audio for transcription. Please try again.',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Restart the transcription',
            'Check audio input',
            'Contact support if the problem persists'
          ],
          helpLinks: [{text: 'Troubleshooting Guide', url: '/help/transcription-issues'}]
        },
        es: {
          template: 'Error al procesar el audio para transcripción. Intente nuevamente.',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Reinicie la transcripción',
            'Verifique la entrada de audio',
            'Contacte soporte si el problema persiste'
          ],
          helpLinks: [{text: 'Guía de Solución de Problemas', url: '/help/transcription-issues'}]
        },
        fr: {
          template: 'Échec du traitement audio pour la transcription. Veuillez réessayer.',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Redémarrez la transcription',
            "Vérifiez l'entrée audio",
            'Contactez le support si le problème persiste'
          ],
          helpLinks: [{text: 'Guide de Dépannage', url: '/help/transcription-issues'}]
        },
        de: {
          template:
            'Fehler beim Verarbeiten des Audios für Transkription. Bitte versuchen Sie es erneut.',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Starten Sie die Transkription neu',
            'Überprüfen Sie die Audioeingabe',
            'Kontaktieren Sie den Support, wenn das Problem weiterhin besteht'
          ],
          helpLinks: [{text: 'Fehlerbehebungsanleitung', url: '/help/transcription-issues'}]
        },
        zh: {
          template: '处理音频转录失败。请重试。',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: ['重启转录', '检查音频输入', '如果问题持续存在，请联系支持'],
          helpLinks: [{text: '故障排除指南', url: '/help/transcription-issues'}]
        },
        ja: {
          template: '転写のための音声処理に失敗しました。もう一度お試しください。',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '転写を再開してください',
            '音声入力を確認してください',
            '問題が継続する場合はサポートに連絡してください'
          ],
          helpLinks: [{text: 'トラブルシューティングガイド', url: '/help/transcription-issues'}]
        },
        ko: {
          template: '전사를 위한 오디오 처리에 실패했습니다. 다시 시도해 주세요.',
          severity: 'high',
          category: 'transcription' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '전사를 다시 시작하세요',
            '오디오 입력을 확인하세요',
            '문제가 계속되면 지원팀에 문의하세요'
          ],
          helpLinks: [{text: '문제 해결 가이드', url: '/help/transcription-issues'}]
        }
      },
      // Audio errors
      'audio.microphone_unavailable': {
        en: {
          template: 'Microphone access is not available. Please grant microphone permissions.',
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Grant microphone permissions in your browser settings',
            'Refresh the page after granting permissions',
            'Check if another application is using the microphone'
          ],
          helpLinks: [{text: 'Microphone Setup Guide', url: '/help/microphone-setup'}]
        },
        es: {
          template: 'El acceso al micrófono no está disponible. Otorgue permisos de micrófono.',
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Otorgue permisos de micrófono en la configuración del navegador',
            'Actualice la página después de otorgar permisos',
            'Verifique si otra aplicación está usando el micrófono'
          ],
          helpLinks: [{text: 'Guía de Configuración de Micrófono', url: '/help/microphone-setup'}]
        },
        fr: {
          template:
            "L'accès au microphone n'est pas disponible. Veuillez accorder les permissions du microphone.",
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Accordez les permissions du microphone dans les paramètres de votre navigateur',
            'Actualisez la page après avoir accordé les permissions',
            'Vérifiez si une autre application utilise le microphone'
          ],
          helpLinks: [{text: 'Guide de Configuration du Microphone', url: '/help/microphone-setup'}]
        },
        de: {
          template:
            'Mikrofonzugriff ist nicht verfügbar. Bitte gewähren Sie Mikrofonberechtigungen.',
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Gewähren Sie Mikrofonberechtigungen in Ihren Browser-Einstellungen',
            'Aktualisieren Sie die Seite nach der Berechtigungserteilung',
            'Überprüfen Sie, ob eine andere Anwendung das Mikrofon verwendet'
          ],
          helpLinks: [{text: 'Mikrofon-Setup-Anleitung', url: '/help/microphone-setup'}]
        },
        zh: {
          template: '麦克风访问不可用。请授予麦克风权限。',
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '在浏览器设置中授予麦克风权限',
            '授予权限后刷新页面',
            '检查是否有其他应用程序正在使用麦克风'
          ],
          helpLinks: [{text: '麦克风设置指南', url: '/help/microphone-setup'}]
        },
        ja: {
          template: 'マイクへのアクセスが利用できません。マイクの許可を与えてください。',
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'ブラウザの設定でマイクの許可を与えてください',
            '許可を与えた後、ページを更新してください',
            '他のアプリケーションがマイクを使用していないか確認してください'
          ],
          helpLinks: [{text: 'マイクセットアップガイド', url: '/help/microphone-setup'}]
        },
        ko: {
          template: '마이크 액세스를 사용할 수 없습니다. 마이크 권한을 허용해 주세요.',
          severity: 'critical',
          category: 'audio' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '브라우저 설정에서 마이크 권한을 허용하세요',
            '권한을 허용한 후 페이지를 새로고침하세요',
            '다른 애플리케이션이 마이크를 사용하고 있는지 확인하세요'
          ],
          helpLinks: [{text: '마이크 설정 가이드', url: '/help/microphone-setup'}]
        }
      },
      // Network errors
      'network.connection_lost': {
        en: {
          template: 'Network connection lost. Attempting to reconnect...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Check your internet connection',
            'Wait for automatic reconnection',
            'Refresh the page if the problem persists'
          ],
          helpLinks: [{text: 'Network Troubleshooting', url: '/help/network-issues'}]
        },
        es: {
          template: 'Conexión de red perdida. Intentando reconectar...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Verifique su conexión a internet',
            'Espere la reconexión automática',
            'Actualice la página si el problema persiste'
          ],
          helpLinks: [{text: 'Solución de Problemas de Red', url: '/help/network-issues'}]
        },
        fr: {
          template: 'Connexion réseau perdue. Tentative de reconnexion...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Vérifiez votre connexion internet',
            'Attendez la reconnexion automatique',
            'Actualisez la page si le problème persiste'
          ],
          helpLinks: [{text: 'Dépannage Réseau', url: '/help/network-issues'}]
        },
        de: {
          template: 'Netzwerkverbindung verloren. Versuche zu reconnektieren...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'Überprüfen Sie Ihre Internetverbindung',
            'Warten Sie auf automatische Wiederverbindung',
            'Aktualisieren Sie die Seite, wenn das Problem weiterhin besteht'
          ],
          helpLinks: [{text: 'Netzwerk-Fehlerbehebung', url: '/help/network-issues'}]
        },
        zh: {
          template: '网络连接丢失。正在尝试重新连接...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: ['检查您的网络连接', '等待自动重连', '如果问题持续存在，请刷新页面'],
          helpLinks: [{text: '网络故障排除', url: '/help/network-issues'}]
        },
        ja: {
          template: 'ネットワーク接続が失われました。再接続を試みています...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            'インターネット接続を確認してください',
            '自動再接続をお待ちください',
            '問題が継続する場合はページを更新してください'
          ],
          helpLinks: [{text: 'ネットワークトラブルシューティング', url: '/help/network-issues'}]
        },
        ko: {
          template: '네트워크 연결이 끊어졌습니다. 다시 연결을 시도하고 있습니다...',
          severity: 'high',
          category: 'network' as ErrorCategory,
          actionRequired: false,
          suggestedActions: [
            '인터넷 연결을 확인하세요',
            '자동 재연결을 기다리세요',
            '문제가 계속되면 페이지를 새로고침하세요'
          ],
          helpLinks: [{text: '네트워크 문제 해결', url: '/help/network-issues'}]
        }
      },
      // System errors
      'system.resource_exhausted': {
        en: {
          template: 'System resources are running low. Performance may be affected.',
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Close unnecessary applications',
            'Clear browser cache',
            'Restart the application if needed'
          ],
          helpLinks: [{text: 'Performance Optimization', url: '/help/performance'}]
        },
        es: {
          template:
            'Los recursos del sistema se están agotando. El rendimiento puede verse afectado.',
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Cierre aplicaciones innecesarias',
            'Limpie el caché del navegador',
            'Reinicie la aplicación si es necesario'
          ],
          helpLinks: [{text: 'Optimización del Rendimiento', url: '/help/performance'}]
        },
        fr: {
          template: "Les ressources système s'épuisent. Les performances peuvent être affectées.",
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Fermez les applications inutiles',
            'Videz le cache du navigateur',
            "Redémarrez l'application si nécessaire"
          ],
          helpLinks: [{text: 'Optimisation des Performances', url: '/help/performance'}]
        },
        de: {
          template: 'Systemressourcen werden knapp. Die Leistung könnte beeinträchtigt werden.',
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            'Schließen Sie unnötige Anwendungen',
            'Löschen Sie den Browser-Cache',
            'Starten Sie die Anwendung neu, falls erforderlich'
          ],
          helpLinks: [{text: 'Performance-Optimierung', url: '/help/performance'}]
        },
        zh: {
          template: '系统资源不足。性能可能受到影响。',
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: ['关闭不必要的应用程序', '清除浏览器缓存', '如需要请重启应用程序'],
          helpLinks: [{text: '性能优化', url: '/help/performance'}]
        },
        ja: {
          template: 'システムリソースが不足しています。パフォーマンスに影響する可能性があります。',
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '不要なアプリケーションを閉じてください',
            'ブラウザのキャッシュをクリアしてください',
            '必要に応じてアプリケーションを再起動してください'
          ],
          helpLinks: [{text: 'パフォーマンス最適化', url: '/help/performance'}]
        },
        ko: {
          template: '시스템 리소스가 부족합니다. 성능에 영향을 줄 수 있습니다.',
          severity: 'medium',
          category: 'system' as ErrorCategory,
          actionRequired: true,
          suggestedActions: [
            '불필요한 애플리케이션을 닫으세요',
            '브라우저 캐시를 지우세요',
            '필요시 애플리케이션을 재시작하세요'
          ],
          helpLinks: [{text: '성능 최적화', url: '/help/performance'}]
        }
      }
    }

    // Add all templates to the system
    for (const [templateId, locales] of Object.entries(defaultTemplates)) {
      for (const [locale, template] of Object.entries(locales)) {
        this.addMessageTemplate(templateId, locale as SupportedLocale, {
          id: templateId,
          ...template
        })
      }
    }

    // Add custom templates if provided
    if (this.config.customTemplates) {
      for (const [templateId, template] of Object.entries(this.config.customTemplates)) {
        this.addMessageTemplate(templateId, this.config.defaultLocale, template)
      }
    }
  }

  /**
   * Add a message template for a specific locale
   */
  addMessageTemplate(
    templateId: string,
    locale: SupportedLocale,
    template: ErrorMessageTemplate
  ): void {
    if (!this.messageTemplates.has(templateId)) {
      this.messageTemplates.set(templateId, new Map())
    }

    const localeMap = this.messageTemplates.get(templateId)!
    localeMap.set(locale, template)

    this.emit('templateAdded', {templateId, locale, template})
  }

  /**
   * Generate a user-facing error message from a classified error
   */
  generateUserMessage(
    error: ClassifiedError,
    context?: ErrorContext,
    options?: Partial<ErrorDisplayOptions>
  ): LocalizedErrorMessage {
    const displayOptions = {...this.config.defaultDisplayOptions, ...options}
    const templateId = this.getTemplateId(error)

    // Try to get localized template
    const template =
      this.getTemplate(templateId, displayOptions.locale) ||
      this.getTemplate(templateId, this.config.defaultLocale) ||
      this.createFallbackTemplate(error)

    // Generate unique error ID
    const errorId = this.generateErrorId(error, context)

    // Create the localized message
    const message = this.processTemplate(template, error, context, displayOptions)

    // Cache the message
    this.messageCache.set(errorId, message)

    // Track analytics
    if (this.config.enableAnalytics) {
      this.trackMessageDisplay(errorId)
    }

    // Add to active messages
    this.activeMessages.set(errorId, message)

    // Auto-dismissal setup
    if (this.config.enableAutoDismissal && !template.actionRequired) {
      setTimeout(() => {
        this.dismissMessage(errorId)
      }, this.config.autoDismissalTimeoutMs)
    }

    this.emit('messageGenerated', message)

    return message
  }

  /**
   * Get template ID based on error classification
   */
  private getTemplateId(error: ClassifiedError): string {
    // Create template ID from category and error type
    const category = error.category.toLowerCase()
    const errorType = error.type.toLowerCase()

    return `${category}.${errorType}`
  }

  /**
   * Get template for specific ID and locale
   */
  private getTemplate(
    templateId: string,
    locale: SupportedLocale
  ): ErrorMessageTemplate | undefined {
    const localeMap = this.messageTemplates.get(templateId)
    return localeMap?.get(locale)
  }

  /**
   * Create fallback template when specific template is not available
   */
  private createFallbackTemplate(error: ClassifiedError): ErrorMessageTemplate {
    return {
      id: 'fallback',
      template: 'An error occurred. Please try again or contact support if the problem persists.',
      severity: error.severity,
      category: error.category,
      actionRequired: error.severity === 'critical',
      suggestedActions: ['Try again', 'Refresh the page', 'Contact support'],
      helpLinks: [{text: 'Support', url: '/help/contact'}]
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(error: ClassifiedError, context?: ErrorContext): string {
    const timestamp = Date.now()
    const errorHash = this.hashError(error, context)
    return `err_${timestamp}_${errorHash}`
  }

  /**
   * Create hash from error and context for ID generation
   */
  private hashError(error: ClassifiedError, context?: ErrorContext): string {
    const hashInput = JSON.stringify({
      type: error.type,
      category: error.category,
      severity: error.severity,
      component: context?.component || 'unknown'
    })

    // Simple hash function
    let hash = 0
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36)
  }

  /**
   * Process template with error data and context
   */
  private processTemplate(
    template: ErrorMessageTemplate,
    error: ClassifiedError,
    context?: ErrorContext,
    options?: ErrorDisplayOptions
  ): LocalizedErrorMessage {
    // Process template placeholders if any (basic implementation)
    let processedMessage = template.template

    // Replace basic placeholders
    processedMessage = processedMessage.replace(/\{errorType\}/g, error.type)
    processedMessage = processedMessage.replace(/\{component\}/g, context?.component || 'system')
    processedMessage = processedMessage.replace(/\{sessionId\}/g, context?.sessionId || 'unknown')

    // Truncate message if needed
    if (options?.maxMessageLength && processedMessage.length > options.maxMessageLength) {
      processedMessage = processedMessage.substring(0, options.maxMessageLength - 3) + '...'
    }

    return {
      message: processedMessage,
      technicalDetails: options?.showTechnicalDetails ? error.message : undefined,
      description: this.generateDescription(error, context),
      suggestedActions: options?.includeSuggestedActions ? template.suggestedActions || [] : [],
      helpLinks: options?.includeHelpLinks ? template.helpLinks || [] : [],
      actionRequired: template.actionRequired,
      errorId: this.generateErrorId(error, context),
      timestamp: Date.now(),
      severity: error.severity
    }
  }

  /**
   * Generate user-friendly description
   */
  private generateDescription(error: ClassifiedError, context?: ErrorContext): string {
    const severityDescriptions = {
      low: 'This is a minor issue that should not affect your experience significantly.',
      medium: 'This issue may impact some functionality. Please follow the suggested actions.',
      high: 'This is a significant issue that may affect core functionality.',
      critical: 'This is a critical issue that prevents the application from working properly.'
    }

    return severityDescriptions[error.severity] || 'An issue has occurred with the application.'
  }

  /**
   * Track message display for analytics
   */
  private trackMessageDisplay(errorId: string): void {
    if (!this.analytics.has(errorId)) {
      this.analytics.set(errorId, {
        displayCount: 0,
        dismissalCount: 0,
        avgTimeToDismissal: 0,
        actionsTaken: 0,
        helpLinksClicked: 0,
        userRatings: []
      })
    }

    const analytics = this.analytics.get(errorId)!
    analytics.displayCount++

    this.emit('analyticsUpdated', {errorId, analytics})
  }

  /**
   * Dismiss an active message
   */
  dismissMessage(errorId: string): boolean {
    const message = this.activeMessages.get(errorId)
    if (!message) {
      return false
    }

    this.activeMessages.delete(errorId)

    // Track dismissal analytics
    if (this.config.enableAnalytics) {
      const analytics = this.analytics.get(errorId)
      if (analytics) {
        analytics.dismissalCount++
        const timeToDismissal = Date.now() - message.timestamp
        analytics.avgTimeToDismissal =
          (analytics.avgTimeToDismissal * (analytics.dismissalCount - 1) + timeToDismissal) /
          analytics.dismissalCount
      }
    }

    this.emit('messageDismissed', {errorId, message})
    return true
  }

  /**
   * Track user action on a message
   */
  trackUserAction(errorId: string, action: string): void {
    if (this.config.enableAnalytics) {
      const analytics = this.analytics.get(errorId)
      if (analytics) {
        analytics.actionsTaken++
        this.emit('userActionTracked', {errorId, action, analytics})
      }
    }
  }

  /**
   * Track help link click
   */
  trackHelpLinkClick(errorId: string, linkUrl: string): void {
    if (this.config.enableAnalytics) {
      const analytics = this.analytics.get(errorId)
      if (analytics) {
        analytics.helpLinksClicked++
        this.emit('helpLinkClicked', {errorId, linkUrl, analytics})
      }
    }
  }

  /**
   * Add user rating for a message
   */
  addUserRating(errorId: string, rating: number): void {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5')
    }

    if (this.config.enableAnalytics) {
      const analytics = this.analytics.get(errorId)
      if (analytics) {
        analytics.userRatings.push(rating)
        this.emit('userRatingAdded', {errorId, rating, analytics})
      }
    }
  }

  /**
   * Get all active messages
   */
  getActiveMessages(): LocalizedErrorMessage[] {
    return Array.from(this.activeMessages.values())
  }

  /**
   * Get messages for a specific severity level
   */
  getMessagesBySeverity(severity: ErrorSeverity): LocalizedErrorMessage[] {
    return this.getActiveMessages().filter(message => message.severity === severity)
  }

  /**
   * Get messages that require user action
   */
  getActionRequiredMessages(): LocalizedErrorMessage[] {
    return this.getActiveMessages().filter(message => message.actionRequired)
  }

  /**
   * Clear all active messages
   */
  clearAllMessages(): void {
    const clearedMessages = Array.from(this.activeMessages.values())
    this.activeMessages.clear()
    this.emit('allMessagesCleared', {clearedMessages})
  }

  /**
   * Get analytics for a specific message
   */
  getMessageAnalytics(errorId: string): ErrorMessageAnalytics | undefined {
    return this.analytics.get(errorId)
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary(): {
    totalMessages: number
    totalDismissals: number
    avgTimeToDismissal: number
    totalActions: number
    totalHelpClicks: number
    avgRating: number
  } {
    const allAnalytics = Array.from(this.analytics.values())

    const summary = {
      totalMessages: allAnalytics.reduce((sum, a) => sum + a.displayCount, 0),
      totalDismissals: allAnalytics.reduce((sum, a) => sum + a.dismissalCount, 0),
      avgTimeToDismissal: 0,
      totalActions: allAnalytics.reduce((sum, a) => sum + a.actionsTaken, 0),
      totalHelpClicks: allAnalytics.reduce((sum, a) => sum + a.helpLinksClicked, 0),
      avgRating: 0
    }

    // Calculate average time to dismissal
    const dismissalTimes = allAnalytics.filter(a => a.dismissalCount > 0)
    if (dismissalTimes.length > 0) {
      summary.avgTimeToDismissal =
        dismissalTimes.reduce((sum, a) => sum + a.avgTimeToDismissal, 0) / dismissalTimes.length
    }

    // Calculate average rating
    const allRatings = allAnalytics.flatMap(a => a.userRatings)
    if (allRatings.length > 0) {
      summary.avgRating = allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length
    }

    return summary
  }

  /**
   * Export analytics data
   */
  exportAnalytics(): Record<string, ErrorMessageAnalytics> {
    return Object.fromEntries(this.analytics)
  }

  /**
   * Clean up old cached messages
   */
  cleanupCache(): void {
    if (this.messageCache.size > this.config.maxCachedMessages) {
      const entries = Array.from(this.messageCache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)

      // Remove oldest 20% of messages
      const toRemove = Math.floor(entries.length * 0.2)
      for (let i = 0; i < toRemove; i++) {
        this.messageCache.delete(entries[i][0])
        this.analytics.delete(entries[i][0])
      }
    }

    this.emit('cacheCleanup', {removedCount: this.messageCache.size})
  }

  /**
   * Update display options for all future messages
   */
  updateDisplayOptions(options: Partial<ErrorDisplayOptions>): void {
    Object.assign(this.config.defaultDisplayOptions, options)
    this.emit('displayOptionsUpdated', options)
  }

  /**
   * Check if a specific locale is supported
   */
  isLocaleSupported(locale: string): boolean {
    const supportedLocales: SupportedLocale[] = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko']
    return supportedLocales.includes(locale as SupportedLocale)
  }

  /**
   * Get available locales for a template
   */
  getAvailableLocales(templateId: string): SupportedLocale[] {
    const localeMap = this.messageTemplates.get(templateId)
    return localeMap ? Array.from(localeMap.keys()) : []
  }
}
