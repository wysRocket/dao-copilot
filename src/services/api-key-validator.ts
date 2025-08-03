/**
 * API Key Validator - Comprehensive validation service for Google API keys
 * 
 * Provides validation for API key format, permissions, and Live API access
 * with comprehensive error reporting and setup recommendations.
 */

export interface ApiKeyValidationResult {
  isValid: boolean;
  key: string;
  errors: string[];
  warnings: string[];
  permissions: {
    hasGenerativeAI: boolean;
    hasLiveAPI: boolean;
    hasValidFormat: boolean;
  };
  recommendations: string[];
}

export interface EnvironmentValidationResult {
  hasValidKeys: boolean;
  validKeys: string[];
  invalidKeys: string[];
  totalKeys: number;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export class ApiKeyValidator {
  private static instance: ApiKeyValidator;

  private constructor() {}

  public static getInstance(): ApiKeyValidator {
    if (!ApiKeyValidator.instance) {
      ApiKeyValidator.instance = new ApiKeyValidator();
    }
    return ApiKeyValidator.instance;
  }

  /**
   * Load and validate all Google API keys from environment variables
   */
  public async loadAndValidateEnvironmentKeys(): Promise<EnvironmentValidationResult> {
    console.log('[ApiKeyValidator] Loading and validating environment keys...');
    
    const result: EnvironmentValidationResult = {
      hasValidKeys: false,
      validKeys: [],
      invalidKeys: [],
      totalKeys: 0,
      errors: [],
      warnings: [],
      recommendations: []
    };

    try {
      // Look for Google API keys in environment
      const googleApiKeys = this.extractGoogleApiKeys();
      result.totalKeys = googleApiKeys.length;

      if (googleApiKeys.length === 0) {
        result.errors.push('No Google API keys found in environment variables');
        result.recommendations.push('Set GOOGLE_API_KEY environment variable');
        result.recommendations.push('Alternatively, set GOOGLE_API_KEY_1, GOOGLE_API_KEY_2, etc. for multiple keys');
        return result;
      }

      console.log(`[ApiKeyValidator] Found ${googleApiKeys.length} API keys to validate`);

      // Validate each key
      for (const key of googleApiKeys) {
        const validation = await this.validateApiKey(key);
        
        if (validation.isValid) {
          result.validKeys.push(key);
        } else {
          result.invalidKeys.push(key);
          result.errors.push(`Invalid API key ${key.substring(0, 10)}...: ${validation.errors.join(', ')}`);
        }
      }

      result.hasValidKeys = result.validKeys.length > 0;

      if (result.hasValidKeys) {
        console.log(`[ApiKeyValidator] Successfully validated ${result.validKeys.length} API keys`);
      } else {
        result.errors.push('No valid API keys found');
        result.recommendations.push('Check that your API keys have Generative AI API access enabled');
        result.recommendations.push('Verify API keys at https://console.cloud.google.com/apis/credentials');
      }

      return result;

    } catch (error) {
      console.error('[ApiKeyValidator] Error during environment validation:', error);
      result.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Validate a single API key with comprehensive checks
   */
  public async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    const result: ApiKeyValidationResult = {
      isValid: false,
      key: apiKey.substring(0, 10) + '...',
      errors: [],
      warnings: [],
      permissions: {
        hasGenerativeAI: false,
        hasLiveAPI: false,
        hasValidFormat: false
      },
      recommendations: []
    };

    try {
      // Basic format validation
      if (!this.validateKeyFormat(apiKey)) {
        result.errors.push('Invalid API key format');
        result.recommendations.push('API keys should start with "AIza" and be 39 characters long');
        return result;
      }

      result.permissions.hasValidFormat = true;

      // Test basic Generative AI API access (lightweight check)
      const hasGenerativeAccess = await this.testGenerativeApiAccess(apiKey);
      result.permissions.hasGenerativeAI = hasGenerativeAccess;

      if (!hasGenerativeAccess) {
        result.errors.push('No access to Generative AI API');
        result.recommendations.push('Enable Generative AI API in Google Cloud Console');
        return result;
      }

      // Test Live API permissions (if possible)
      try {
        const hasLiveAccess = await this.testLiveApiPermissions(apiKey);
        result.permissions.hasLiveAPI = hasLiveAccess;
        
        if (!hasLiveAccess) {
          result.warnings.push('Live API access could not be verified');
          result.recommendations.push('Ensure Live API permissions are enabled if using WebSocket features');
        }
      } catch {
        result.warnings.push('Could not test Live API permissions');
      }

      // Key is valid if it has basic format and Generative AI access
      result.isValid = result.permissions.hasValidFormat && result.permissions.hasGenerativeAI;

      return result;

    } catch (error) {
      console.error('[ApiKeyValidator] Error validating API key:', error);
      result.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Extract Google API keys from environment variables
   */
  private extractGoogleApiKeys(): string[] {
    const keys: string[] = [];
    
    // Check standard environment variable
    if (process.env.GOOGLE_API_KEY) {
      keys.push(process.env.GOOGLE_API_KEY);
    }

    // Check numbered variations (GOOGLE_API_KEY_1, GOOGLE_API_KEY_2, etc.)
    for (let i = 1; i <= 10; i++) {
      const key = process.env[`GOOGLE_API_KEY_${i}`];
      if (key) {
        keys.push(key);
      }
    }

    // Remove duplicates and empty strings
    return [...new Set(keys)].filter(key => key && key.trim().length > 0);
  }

  /**
   * Validate API key format
   */
  private validateKeyFormat(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Google API keys typically start with "AIza" and are 39 characters long
    const trimmedKey = apiKey.trim();
    return trimmedKey.startsWith('AIza') && trimmedKey.length === 39;
  }

  /**
   * Test basic Generative AI API access
   */
  private async testGenerativeApiAccess(apiKey: string): Promise<boolean> {
    try {
      // Simple test - try to access the models endpoint
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.ok;
    } catch (error) {
      console.warn('[ApiKeyValidator] Could not test Generative AI access:', error);
      return false;
    }
  }

  /**
   * Test Live API permissions (WebSocket access)
   */
  private async testLiveApiPermissions(apiKey: string): Promise<boolean> {
    try {
      // Test if we can create a Live API session (without actually connecting)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1alpha/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: 'test' }]
            }]
          })
        }
      );

      return response.ok;
    } catch (error) {
      console.warn('[ApiKeyValidator] Could not test Live API permissions:', error);
      return false;
    }
  }

  /**
   * Get setup recommendations based on validation results
   */
  public getSetupRecommendations(validationResult: EnvironmentValidationResult): string[] {
    const recommendations: string[] = [];

    if (!validationResult.hasValidKeys) {
      recommendations.push('🔑 Obtain a Google API key from https://console.cloud.google.com/apis/credentials');
      recommendations.push('🔧 Enable the Generative AI API in your Google Cloud project');
      recommendations.push('💾 Set the GOOGLE_API_KEY environment variable');
    }

    if (validationResult.validKeys.length < 2) {
      recommendations.push('⚡ Consider setting up multiple API keys for quota management');
      recommendations.push('📈 Use GOOGLE_API_KEY_1, GOOGLE_API_KEY_2, etc. for multiple keys');
    }

    return recommendations;
  }
}

// Singleton instance
export const apiKeyValidator = ApiKeyValidator.getInstance();