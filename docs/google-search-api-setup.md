# Google Custom Search API Setup Guide

This guide walks you through setting up the Google Custom Search API for the AI Answering Machine project.

## Overview

The Google Custom Search API allows your application to programmatically search the web and receive structured results. This is essential for the AI Answering Machine to provide real-time answers to user questions.

## Prerequisites

Before starting, ensure you have:
- A Google account
- Access to Google Cloud Console
- Basic understanding of API keys and environment variables

## Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" dropdown at the top
3. Click "NEW PROJECT"
4. Enter a project name (e.g., "ai-answering-machine")
5. Click "CREATE"

### 2. Enable the Custom Search API

1. In your Google Cloud project, go to **APIs & Services > Library**
2. Search for "Custom Search API"
3. Click on "Custom Search API" by Google
4. Click "ENABLE"

### 3. Create API Credentials

1. Go to **APIs & Services > Credentials**
2. Click "CREATE CREDENTIALS" → "API key"
3. Copy the generated API key
4. (Optional) Click "RESTRICT KEY" to add security restrictions:
   - Under "API restrictions", select "Restrict key"
   - Choose "Custom Search API"
   - Under "Application restrictions", consider adding HTTP referrers or IP addresses

### 4. Create a Custom Search Engine

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click "Add" to create a new search engine
3. Configure your search engine:
   - **Sites to search**: Enter `*` to search the entire web, or specify particular domains
   - **Name**: Give your search engine a descriptive name
   - **Language**: Select your preferred language
4. Click "CREATE"
5. In the "Setup" section, copy your **Search Engine ID**

### 5. Configure Search Engine Settings (Optional)

1. In your Programmable Search Engine control panel:
   - Go to **Setup** tab for basic configuration
   - Go to **Look and feel** tab to customize appearance
   - Go to **Search features** tab for advanced options:
     - Enable "Image search" if you want image results
     - Enable "Safe Search" for content filtering
     - Configure "Advanced" settings for specific requirements

## Automated Setup

Run the automated setup script to configure your project:

```bash
node scripts/setup-google-search-api.js
```

This script will:
- Verify your credentials
- Create configuration files
- Test the API connection
- Set up environment variables

## Manual Setup

If you prefer manual configuration:

### 1. Environment Variables

Create or update your `.env` file:

```env
# Google Custom Search API Configuration
GOOGLE_SEARCH_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here
```

### 2. Test Your Setup

Create a test script to verify your configuration:

```javascript
const axios = require('axios');
require('dotenv').config();

async function testGoogleSearchAPI() {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !searchEngineId) {
        throw new Error('Missing API credentials in .env file');
    }
    
    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = {
        key: apiKey,
        cx: searchEngineId,
        q: 'test search',
        num: 1
    };
    
    try {
        const response = await axios.get(url, { params });
        console.log('✅ API test successful!');
        console.log(`Found ${response.data.items?.length || 0} results`);
        
        if (response.data.items?.[0]) {
            console.log(`Sample result: "${response.data.items[0].title}"`);
        }
    } catch (error) {
        console.error('❌ API test failed:', error.message);
        throw error;
    }
}

testGoogleSearchAPI();
```

## API Limits and Pricing

### Free Tier
- **100 search queries per day**
- $0 cost
- Suitable for development and testing

### Paid Tier
- **Up to 10,000 search queries per day**
- $5 per 1,000 queries
- Required for production applications

### Rate Limiting
- No specific rate limit per minute/hour
- Daily quota resets at midnight Pacific Time

## Configuration File

The setup creates a `google-search-config.json` file with default settings:

```json
{
  "version": "1.0.0",
  "api": {
    "name": "Google Custom Search API",
    "version": "v1",
    "baseUrl": "https://www.googleapis.com/customsearch/v1"
  },
  "rateLimits": {
    "free": {
      "dailyLimit": 100,
      "intervalMs": 86400000
    },
    "paid": {
      "dailyLimit": 10000,
      "intervalMs": 86400000
    }
  },
  "defaultSearchOptions": {
    "num": 10,
    "safe": "active"
  },
  "caching": {
    "enabled": true,
    "ttlSeconds": 3600,
    "maxEntries": 1000
  },
  "errorHandling": {
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "exponentialBackoff": true
  }
}
```

## Security Best Practices

### 1. API Key Security
- Never commit API keys to version control
- Use environment variables for sensitive data
- Consider using Google Cloud Secret Manager for production
- Restrict API key usage by IP address or HTTP referrer

### 2. Input Sanitization
- Validate and sanitize search queries
- Implement maximum query length limits
- Filter out potentially harmful content

### 3. Rate Limiting
- Implement client-side rate limiting to avoid quota exhaustion
- Monitor API usage and set up alerts
- Cache search results to reduce API calls

## Troubleshooting

### Common Issues

#### "API key not valid" Error
- Verify your API key is correct
- Check that the Custom Search API is enabled for your project
- Ensure there are no extra spaces in your API key

#### "Invalid request" Error
- Verify your Search Engine ID is correct
- Check that your search query is properly encoded
- Ensure required parameters are included

#### "Daily Limit Exceeded" Error
- You've reached your daily quota (100 for free, 10,000 for paid)
- Wait until midnight Pacific Time for quota reset
- Consider upgrading to paid tier for higher limits

#### "403 Forbidden" Error
- Check API key permissions and restrictions
- Verify the Custom Search API is enabled
- Check if your IP address is allowed (if restrictions are set)

### Testing Commands

```bash
# Test API connection
curl "https://www.googleapis.com/customsearch/v1?key=YOUR_API_KEY&cx=YOUR_SEARCH_ENGINE_ID&q=test"

# Check API quota (if available)
curl -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  "https://serviceusage.googleapis.com/v1/projects/YOUR_PROJECT_ID/services/customsearch.googleapis.com/quotas"
```

## Next Steps

After completing this setup:

1. **Task 3.2**: Implement the ToolCallHandler class
2. **Task 3.3**: Integrate with Gemini Live API
3. **Task 3.4**: Implement caching and fallback mechanisms
4. **Task 3.5**: Handle VAD interruptions

## Resources

- [Google Custom Search API Documentation](https://developers.google.com/custom-search/v1/overview)
- [Programmable Search Engine Help](https://developers.google.com/custom-search/docs/tutorial/creatingcse)
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)

---

📝 **Note**: Keep this documentation updated as you progress through the implementation. If you encounter issues not covered here, add them to the troubleshooting section for future reference.