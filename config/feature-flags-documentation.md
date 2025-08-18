# Feature Flag System Configuration Template

This directory contains the configuration template and documentation for the transcription loss prevention feature flag system.

## Configuration Structure

The feature flag system manages configuration for four main components:

### 1. Orphan Detection Configuration

```json
{
  "orphanDetection": {
    "scanIntervalMs": 2000, // How often to scan for orphans (1000-60000ms)
    "stuckThresholdMs": 4000, // When to consider a partial as stuck (1000-30000ms)
    "trailingTimeoutMs": 3000, // When to consider small partials as trailing (1000-15000ms)
    "trailingMinChars": 150, // Minimum character count to not be considered trailing (10-1000)
    "maxOrphansPerScan": 10, // Maximum orphans to process per scan (1-100)
    "aggressiveDetection": false, // Enable aggressive orphan detection
    "enabled": true // Enable orphan detection worker
  }
}
```

### 2. Gap Detection Configuration

```json
{
  "gapDetection": {
    "timestampGapThresholdMs": 1500, // Minimum gap in timestamps to trigger detection (500-10000ms)
    "maxSilencePeriodMs": 2000, // Maximum acceptable silence period (1000-30000ms)
    "minAudioDurationMs": 500, // Minimum audio duration to analyze (100-5000ms)
    "speechConfidenceThreshold": 0.7, // Speech detection confidence threshold (0.1-1.0)
    "audioAlignmentToleranceMs": 300, // Audio alignment tolerance (50-2000ms)
    "enableSpeechPatternAnalysis": true, // Enable advanced speech pattern analysis
    "enableAudioAlignment": true, // Enable audio alignment detection
    "enabled": true // Enable gap detection
  }
}
```

### 3. Recovery Management Configuration

```json
{
  "recovery": {
    "maxRecoveryAttempts": 3, // Maximum recovery attempts per issue (1-10)
    "recoveryTimeoutMs": 5000, // Timeout for individual recovery operations (1000-30000ms)
    "retryDelayMs": 1000, // Delay between recovery attempts (100-10000ms)
    "exponentialBackoff": true, // Enable exponential backoff for retries
    "maxBackoffDelayMs": 8000, // Maximum backoff delay (1000-60000ms)
    "enableContextReconstruction": true, // Enable context reconstruction recovery
    "enableSessionRestart": true, // Enable session restart recovery
    "enableForcedFinalization": true, // Enable forced finalization recovery
    "enabled": true // Enable recovery operations
  }
}
```

### 4. Telemetry Configuration

```json
{
  "telemetry": {
    "maxEventHistory": 1000, // Maximum events to keep in memory (100-10000)
    "aggregationIntervalMs": 30000, // How often to aggregate statistics (5000-300000ms)
    "exportIntervalMs": 300000, // How often to export telemetry data (60000-3600000ms)
    "logLevel": "info", // Minimum log level: debug, info, warn, error, critical
    "enableDebugEvents": false, // Enable debug event logging
    "enablePerformanceMetrics": true, // Enable performance metrics collection
    "enableAutoReporting": true, // Enable automatic reporting
    "enabled": true // Enable telemetry collection
  }
}
```

### 5. System Configuration

```json
{
  "system": {
    "autoSave": true, // Enable configuration auto-save
    "saveIntervalMs": 60000, // Configuration file save interval (ms)
    "enableValidation": true, // Enable configuration validation
    "enableEnvOverrides": true, // Enable environment variable overrides
    "configFilePath": "./config/feature-flags.json" // Configuration file path
  }
}
```

## Environment Variable Overrides

You can override any configuration value using environment variables. The naming convention is:
`{COMPONENT}_{SETTING_NAME}` in uppercase with underscores.

### Orphan Detection

- `ORPHAN_SCAN_INTERVAL_MS` - Scan interval in milliseconds
- `ORPHAN_STUCK_THRESHOLD_MS` - Stuck threshold in milliseconds
- `ORPHAN_TRAILING_TIMEOUT_MS` - Trailing timeout in milliseconds
- `ORPHAN_TRAILING_MIN_CHARS` - Minimum characters for trailing detection
- `ORPHAN_MAX_PER_SCAN` - Maximum orphans per scan
- `ORPHAN_AGGRESSIVE_DETECTION` - Enable aggressive detection (true/false)
- `ORPHAN_DETECTION_ENABLED` - Enable orphan detection (true/false)

### Gap Detection

- `GAP_TIMESTAMP_THRESHOLD_MS` - Timestamp gap threshold in milliseconds
- `GAP_MAX_SILENCE_MS` - Maximum silence period in milliseconds
- `GAP_MIN_AUDIO_MS` - Minimum audio duration in milliseconds
- `GAP_SPEECH_CONFIDENCE` - Speech confidence threshold (0.0-1.0)
- `GAP_AUDIO_TOLERANCE_MS` - Audio alignment tolerance in milliseconds
- `GAP_SPEECH_ANALYSIS_ENABLED` - Enable speech pattern analysis (true/false)
- `GAP_AUDIO_ALIGNMENT_ENABLED` - Enable audio alignment (true/false)
- `GAP_DETECTION_ENABLED` - Enable gap detection (true/false)

### Recovery Management

- `RECOVERY_MAX_ATTEMPTS` - Maximum recovery attempts
- `RECOVERY_TIMEOUT_MS` - Recovery timeout in milliseconds
- `RECOVERY_RETRY_DELAY_MS` - Retry delay in milliseconds
- `RECOVERY_EXPONENTIAL_BACKOFF` - Enable exponential backoff (true/false)
- `RECOVERY_MAX_BACKOFF_MS` - Maximum backoff delay in milliseconds
- `RECOVERY_CONTEXT_RECONSTRUCTION` - Enable context reconstruction (true/false)
- `RECOVERY_SESSION_RESTART` - Enable session restart (true/false)
- `RECOVERY_FORCED_FINALIZATION` - Enable forced finalization (true/false)
- `RECOVERY_ENABLED` - Enable recovery operations (true/false)

### Telemetry

- `TELEMETRY_MAX_EVENTS` - Maximum event history size
- `TELEMETRY_AGGREGATION_MS` - Aggregation interval in milliseconds
- `TELEMETRY_EXPORT_MS` - Export interval in milliseconds
- `TELEMETRY_LOG_LEVEL` - Log level (debug/info/warn/error/critical)
- `TELEMETRY_DEBUG_EVENTS` - Enable debug events (true/false)
- `TELEMETRY_PERFORMANCE_METRICS` - Enable performance metrics (true/false)
- `TELEMETRY_AUTO_REPORTING` - Enable auto reporting (true/false)
- `TELEMETRY_ENABLED` - Enable telemetry (true/false)

## Usage Examples

### Basic Initialization

```typescript
import {
  initializeFeatureFlagManager,
  initializeConfigurationIntegration
} from './FeatureFlagManager'

// Initialize with default configuration
const featureFlagManager = await initializeFeatureFlagManager()
const configIntegration = await initializeConfigurationIntegration()
```

### Custom Initialization

```typescript
import {initializeFeatureFlagManager} from './FeatureFlagManager'

// Initialize with custom configuration
const featureFlagManager = await initializeFeatureFlagManager({
  orphanDetection: {
    scanIntervalMs: 3000, // Slower scanning
    aggressiveDetection: true // Enable aggressive mode
  },
  telemetry: {
    logLevel: 'debug', // Enable debug logging
    enableDebugEvents: true
  },
  system: {
    configFilePath: './custom-config.json',
    saveIntervalMs: 30000 // Save more frequently
  }
})
```

### Dynamic Configuration Updates

```typescript
// Update specific component configuration
await featureFlagManager.updateOrphanDetectionConfig({
  scanIntervalMs: 1500,
  stuckThresholdMs: 3000
})

// Update through integration service
const configIntegration = getConfigurationIntegration()
await configIntegration.updateComponentConfiguration('gapDetection', {
  timestampGapThresholdMs: 2000,
  speechConfidenceThreshold: 0.8
})

// Enable/disable components
await configIntegration.setComponentEnabled('orphanDetection', false)
```

### Configuration History and Rollback

```typescript
// Get configuration history
const history = featureFlagManager.getConfigHistory()
console.log(`History has ${history.length} entries`)

// Rollback to previous configuration
await featureFlagManager.rollbackConfig(1)

// Rollback multiple steps
await featureFlagManager.rollbackConfig(3)
```

### Component Registration

```typescript
// Register worker components
configIntegration.registerOrphanDetectionWorker(orphanWorker)
configIntegration.registerGapDetector(gapDetector)
configIntegration.registerRecoveryManager(recoveryManager)
configIntegration.registerTelemetryCoordinator(telemetryCoordinator)

// Configuration changes will now automatically propagate to registered components
```

## Performance Considerations

1. **Configuration Updates**: Updates are validated and propagated immediately to registered components
2. **Auto-Save**: Configuration is automatically saved at regular intervals (configurable)
3. **Memory Usage**: Event history is limited to prevent memory leaks
4. **Validation**: Configuration validation can be disabled for performance in production
5. **Environment Overrides**: Applied only during initialization to avoid runtime overhead

## Best Practices

1. **Environment-Specific Configuration**: Use environment variables for deployment-specific settings
2. **Validation**: Keep validation enabled in development, consider disabling in production if needed
3. **History Management**: History is automatically managed with configurable limits
4. **Component Registration**: Register components during application startup
5. **Graceful Shutdown**: Always call shutdown methods to save configuration and cleanup resources
6. **Error Handling**: Listen for configuration error events to handle validation failures gracefully

## File Locations

- **Default Config**: `./config/feature-flags.json`
- **Custom Config**: Configurable via `system.configFilePath`
- **Examples**: `./src/services/workers/FeatureFlagIntegrationExample.ts`
- **Documentation**: This file (`./config/feature-flags-documentation.md`)

## Troubleshooting

### Configuration Not Loading

- Check file path in `system.configFilePath`
- Verify file permissions
- Check console for loading errors

### Environment Overrides Not Working

- Verify `system.enableEnvOverrides` is `true`
- Check environment variable names (must match exactly)
- Environment overrides are applied only during initialization

### Validation Errors

- Check value ranges in this documentation
- Use `featureFlagManager.getSystemInfo()` to check validation status
- Listen for `config:validated` events for detailed error information

### Components Not Receiving Updates

- Verify components are registered with ConfigurationIntegration
- Check that ConfigurationIntegration is started
- Listen for `config:propagation:failed` events for error details
