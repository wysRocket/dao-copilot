// Environment configuration helper for the main process
// This file helps ensure API keys are properly loaded in Electron's main process

/**
 * Load environment variables from various sources
 * This is especially important in Electron where environment variables
 * might not be automatically loaded in the main process
 */
export async function loadEnvironmentConfig(): Promise<void> {
  // In development, you might want to load from a .env file
  try {
    // Try to load dotenv if available (for development)
    const dotenv = await import('dotenv');
    dotenv.config();
    console.log('Environment variables loaded from .env file');
  } catch {
    // dotenv is not installed or .env file doesn't exist
    console.log(
      'No .env file found or dotenv not installed, using system environment variables',
    );
  }

  // Log available API key sources (without revealing the actual keys)
  const apiKeySources = [
    'GOOGLE_API_KEY',
    'VITE_GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GEMINI_API_KEY',
  ];

  console.log('Checking for API keys in environment:');
  apiKeySources.forEach((key) => {
    const value = process.env[key];
    if (value) {
      console.log(`✓ ${key}: ${value.substring(0, 8)}...`);
    } else {
      console.log(`✗ ${key}: not found`);
    }
  });
}

/**
 * Get the Google API key from various possible environment variables
 */
export function getGoogleApiKey(): string | undefined {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

/**
 * Validate that required environment variables are present
 */
export function validateEnvironmentConfig(): boolean {
  const apiKey = getGoogleApiKey();

  if (!apiKey) {
    console.error('❌ Google API Key is missing!');
    console.error('Please set one of these environment variables:');
    console.error('  - GOOGLE_API_KEY');
    console.error('  - VITE_GOOGLE_API_KEY');
    console.error('  - GOOGLE_GENERATIVE_AI_API_KEY');
    console.error('  - GEMINI_API_KEY');
    console.error('');
    console.error('Example: export GOOGLE_API_KEY="your-api-key-here"');
    return false;
  }

  console.log('✅ Google API Key found and loaded');
  return true;
}
