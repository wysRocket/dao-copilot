/**
 * Google Speech-to-Text Integration Demo
 *
 * Demonstrates how to set up and use Google Speech-to-Text with the quality system
 * for Ukrainian/mixed language transcription scenarios.
 */

import {
  setupQualitySystem,
  GoogleSpeechIntegrationService,
  GoogleSpeechIntegrationConfigurations,
  GoogleCloudAuthConfigurations,
  ProviderUtils,
  TranscriptionQualityManager
} from '../quality'

/**
 * Example 1: Basic Google Speech setup with service account credentials
 */
async function basicGoogleSpeechSetup() {
  console.log('=== Basic Google Speech Setup ===')

  try {
    // Sample credentials (in production, load from secure storage)
    const credentials = {
      type: 'service_account' as const,
      project_id: 'your-project-id',
      private_key_id: 'your-private-key-id',
      private_key: '-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----',
      client_email: 'your-service-account@your-project.iam.gserviceaccount.com',
      client_id: 'your-client-id',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url:
        'https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com'
    }

    // Create authentication configuration
    const authConfig = GoogleCloudAuthConfigurations.serviceAccount('your-project-id', credentials)

    // Create integration configuration
    const integrationConfig = GoogleSpeechIntegrationConfigurations.ukrainianFocused(
      'your-project-id',
      authConfig
    )

    // Create and initialize the integration
    const integration = new GoogleSpeechIntegrationService(integrationConfig)
    const status = await integration.initialize()

    console.log('Integration Status:', status)

    // Test the integration
    const testResults = await integration.testIntegration()
    console.log('Test Results:', testResults)

    return integration
  } catch (error) {
    console.error('Basic setup failed:', error)
    throw error
  }
}

/**
 * Example 2: Complete quality system with Google Speech integration
 */
async function completeQualitySystemSetup() {
  console.log('=== Complete Quality System Setup ===')

  try {
    // Step 1: Set up base quality system for Ukrainian environment
    const qualityManager = setupQualitySystem.ukrainian()
    console.log('Base quality system initialized')

    // Step 2: Set up Google Speech integration
    const googleConfig = {
      projectId: 'your-project-id',
      keyFilename: './path/to/service-account-key.json' // Alternative to credentials object
    }

    const googleIntegration = await ProviderUtils.createGoogleSpeechSetup(googleConfig)
    await googleIntegration.initialize()
    console.log('Google Speech integration initialized')

    // Step 3: Register Google Speech with quality manager
    await googleIntegration.registerWithQualityManager(qualityManager)
    console.log('Google Speech registered with quality manager')

    // Step 4: Test the complete system
    const systemStatus = qualityManager.getSystemStatus()
    console.log('Complete System Status:', systemStatus)

    return {
      qualityManager,
      googleIntegration
    }
  } catch (error) {
    console.error('Complete system setup failed:', error)
    throw error
  }
}

/**
 * Example 3: Transcription with automatic provider selection
 */
async function transcriptionWithProviderSelection(
  qualityManager: TranscriptionQualityManager,
  audioBuffer: ArrayBuffer
) {
  console.log('=== Transcription with Provider Selection ===')

  try {
    // Get enhanced transcription with quality optimization
    const result = await qualityManager.transcribeWithQuality(audioBuffer, {
      language: 'uk', // Primary language
      enableMixedLanguage: true, // Allow Ukrainian-English mixing
      quality: 'high',
      alternatives: true,
      enableProviderComparison: true,
      timeout: 10000
    })

    console.log('Transcription Result:', {
      text: result.text,
      confidence: result.confidence,
      detectedLanguage: result.detectedLanguage,
      provider: result.selectedProvider,
      qualityScore: result.qualityScore,
      processingTime: result.processingTime
    })

    // Get quality insights
    const insights = await qualityManager.getInsights()
    console.log('Quality Insights:', insights)

    return result
  } catch (error) {
    console.error('Transcription failed:', error)
    throw error
  }
}

/**
 * Example 4: Real-time streaming transcription
 */
async function streamingTranscription(qualityManager: TranscriptionQualityManager) {
  console.log('=== Streaming Transcription ===')

  try {
    // Start streaming transcription
    const stream = await qualityManager.startStreaming({
      language: 'uk',
      enableMixedLanguage: true,
      quality: 'medium',
      interimResults: true
    })

    console.log('Streaming started with ID:', stream.streamId)

    // Set up event listeners
    qualityManager.on('streaming:data', (streamId: string, result: Record<string, unknown>) => {
      console.log(`Stream ${streamId} - ${result.isFinal ? 'Final' : 'Interim'}:`, result.text)
    })

    qualityManager.on('streaming:language-detected', (streamId: string, language: string) => {
      console.log(`Stream ${streamId} - Language detected:`, language)
    })

    qualityManager.on(
      'streaming:provider-switched',
      (streamId: string, fromProvider: string, toProvider: string) => {
        console.log(`Stream ${streamId} - Provider switched: ${fromProvider} -> ${toProvider}`)
      }
    )

    // Simulate audio streaming (in real app, this would come from microphone)
    const simulateAudioStreaming = async () => {
      for (let i = 0; i < 10; i++) {
        // Create mock audio chunk
        const audioChunk = new ArrayBuffer(1024 * (i + 1))
        stream.writeAudio(audioChunk)

        // Wait between chunks
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // End the stream
      stream.endStream()
    }

    await simulateAudioStreaming()
    console.log('Streaming completed')
  } catch (error) {
    console.error('Streaming transcription failed:', error)
    throw error
  }
}

/**
 * Example 5: Quality monitoring and optimization
 */
async function qualityMonitoringDemo(qualityManager: TranscriptionQualityManager) {
  console.log('=== Quality Monitoring Demo ===')

  try {
    // Get current quality metrics
    const metrics = await qualityManager.getQualityMetrics()
    console.log('Current Quality Metrics:', metrics)

    // Get provider performance comparison
    const comparison = await qualityManager.compareProviders()
    console.log('Provider Comparison:', comparison)

    // Get optimization recommendations
    const recommendations = await qualityManager.getOptimizationRecommendations()
    console.log('Optimization Recommendations:', recommendations)

    // Set up quality monitoring events
    qualityManager.on('quality:warning', (warning: Record<string, unknown>) => {
      console.log('Quality Warning:', warning)
    })

    qualityManager.on(
      'quality:provider-recommendation',
      (recommendation: Record<string, unknown>) => {
        console.log('Provider Recommendation:', recommendation)
      }
    )

    return {
      metrics,
      comparison,
      recommendations
    }
  } catch (error) {
    console.error('Quality monitoring failed:', error)
    throw error
  }
}

/**
 * Example 6: Configuration management
 */
async function configurationManagement() {
  console.log('=== Configuration Management ===')

  try {
    // Get system capabilities
    const capabilities = ProviderUtils.getSupportedLanguages()
    console.log('Supported Languages:', capabilities)

    // Validate requirements
    const requirements = ProviderUtils.validateProviderRequirements()
    console.log('Provider Requirements:', requirements)

    // Example configuration updates
    const integration = new GoogleSpeechIntegrationService({
      projectId: 'your-project-id',
      auth: GoogleCloudAuthConfigurations.adc('your-project-id'),
      providerConfig: {
        priority: 8,
        enabled: true,
        qualityThreshold: 0.8
      },
      qualityConfig: {
        enableQualityMonitoring: true,
        minConfidenceScore: 0.7,
        autoSwitchThreshold: 0.75
      }
    })

    // Update configuration dynamically
    integration.updateConfiguration({
      qualityConfig: {
        enableQualityMonitoring: true,
        minConfidenceScore: 0.8, // Increased threshold
        autoSwitchThreshold: 0.8,
        comparisonEnabled: true
      }
    })

    console.log('Configuration updated')

    return integration
  } catch (error) {
    console.error('Configuration management failed:', error)
    throw error
  }
}

/**
 * Main demo function - runs all examples
 */
async function runDemo() {
  console.log('🎤 Google Speech-to-Text Integration Demo')
  console.log('==========================================\n')

  try {
    // Example 1: Basic setup
    console.log('1. Running basic setup...')
    // const basicIntegration = await basicGoogleSpeechSetup();

    // Example 2: Complete system
    console.log('\n2. Running complete system setup...')
    // const { qualityManager, googleIntegration } = await completeQualitySystemSetup();

    // Example 3: Mock transcription (using mock data)
    console.log('\n3. Running transcription demo...')
    // const mockAudio = new ArrayBuffer(4096);
    // const transcriptionResult = await transcriptionWithProviderSelection(qualityManager, mockAudio);

    // Example 4: Streaming demo
    console.log('\n4. Running streaming demo...')
    // await streamingTranscription(qualityManager);

    // Example 5: Quality monitoring
    console.log('\n5. Running quality monitoring demo...')
    // const monitoring = await qualityMonitoringDemo(qualityManager);

    // Example 6: Configuration
    console.log('\n6. Running configuration demo...')
    const configIntegration = await configurationManagement()

    console.log('\n✅ Demo completed successfully!')

    // Cleanup
    // basicIntegration?.cleanup();
    // googleIntegration?.cleanup();
    configIntegration?.cleanup()
  } catch (error) {
    console.error('\n❌ Demo failed:', error)
  }
}

// Export demo functions for individual testing
export {
  basicGoogleSpeechSetup,
  completeQualitySystemSetup,
  transcriptionWithProviderSelection,
  streamingTranscription,
  qualityMonitoringDemo,
  configurationManagement,
  runDemo
}

// Run demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error)
}
