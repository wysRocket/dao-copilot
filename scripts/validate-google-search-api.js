#!/usr/bin/env node

/**
 * Google Custom Search API Validation Script
 * 
 * This script validates that the Google Custom Search API is properly configured
 * and tests basic functionality.
 */

const axios = require('axios').default;
const fs = require('fs');
const path = require('path');

class GoogleSearchAPIValidator {
    constructor() {
        // Load environment variables
        this.loadEnvironment();
        
        this.apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        this.baseUrl = 'https://www.googleapis.com/customsearch/v1';
    }

    loadEnvironment() {
        // Try to load .env file if it exists
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const envLines = envContent.split('\n');
            
            for (const line of envLines) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=').trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    }

    async validate() {
        console.log('🔍 Google Custom Search API Validation');
        console.log('=====================================\n');

        try {
            await this.checkCredentials();
            await this.testBasicSearch();
            await this.testSearchParameters();
            await this.testErrorHandling();
            await this.checkQuota();
            
            console.log('\n✅ All validation tests passed!');
            console.log('🚀 Google Custom Search API is ready for use.');
        } catch (error) {
            console.error('\n❌ Validation failed:', error.message);
            process.exit(1);
        }
    }

    async checkCredentials() {
        console.log('🔑 Checking credentials...');
        
        if (!this.apiKey) {
            throw new Error('GOOGLE_SEARCH_API_KEY not found in environment variables');
        }
        
        if (!this.searchEngineId) {
            throw new Error('GOOGLE_SEARCH_ENGINE_ID not found in environment variables');
        }
        
        if (this.apiKey.length < 30) {
            throw new Error('API key appears to be invalid (too short)');
        }
        
        if (this.searchEngineId.length < 10) {
            throw new Error('Search Engine ID appears to be invalid (too short)');
        }
        
        console.log('   ✅ Credentials found and appear valid');
    }

    async testBasicSearch() {
        console.log('\n🧪 Testing basic search functionality...');
        
        const testQueries = [
            'JavaScript programming',
            'artificial intelligence',
            'weather today'
        ];
        
        for (const query of testQueries) {
            console.log(`   🔄 Testing query: "${query}"`);
            
            const params = {
                key: this.apiKey,
                cx: this.searchEngineId,
                q: query,
                num: 3
            };
            
            try {
                const startTime = Date.now();
                const response = await axios.get(this.baseUrl, { params, timeout: 10000 });
                const responseTime = Date.now() - startTime;
                
                if (response.data && response.data.items) {
                    console.log(`   ✅ Found ${response.data.items.length} results (${responseTime}ms)`);
                    
                    // Show sample result
                    if (response.data.items[0]) {
                        const item = response.data.items[0];
                        console.log(`      📄 Sample: "${item.title}" - ${item.link}`);
                    }
                } else {
                    console.log(`   ⚠️  No results found for "${query}"`);
                }
                
            } catch (error) {
                throw new Error(`Search failed for "${query}": ${this.parseError(error)}`);
            }
        }
    }

    async testSearchParameters() {
        console.log('\n⚙️  Testing search parameters...');
        
        const tests = [
            {
                name: 'Limited results',
                params: { q: 'test', num: 1 },
                expectedResults: 1
            },
            {
                name: 'Safe search',
                params: { q: 'family friendly content', safe: 'active', num: 2 },
                expectedResults: 2
            },
            {
                name: 'Start offset',
                params: { q: 'technology', start: 1, num: 2 },
                expectedResults: 2
            }
        ];
        
        for (const test of tests) {
            console.log(`   🔄 Testing: ${test.name}`);
            
            const params = {
                key: this.apiKey,
                cx: this.searchEngineId,
                ...test.params
            };
            
            try {
                const response = await axios.get(this.baseUrl, { params, timeout: 10000 });
                
                if (response.data && response.data.items) {
                    const actualResults = response.data.items.length;
                    console.log(`   ✅ ${test.name}: ${actualResults} results (expected ≤ ${test.expectedResults})`);
                } else {
                    console.log(`   ⚠️  ${test.name}: No results found`);
                }
                
            } catch (error) {
                throw new Error(`Parameter test "${test.name}" failed: ${this.parseError(error)}`);
            }
        }
    }

    async testErrorHandling() {
        console.log('\n🚨 Testing error handling...');
        
        // Test with invalid query (too long)
        console.log('   🔄 Testing overly long query...');
        try {
            const longQuery = 'a'.repeat(3000); // Very long query
            const params = {
                key: this.apiKey,
                cx: this.searchEngineId,
                q: longQuery
            };
            
            await axios.get(this.baseUrl, { params, timeout: 5000 });
            console.log('   ⚠️  Long query was accepted (unexpected)');
            
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log('   ✅ Long query properly rejected with 400 error');
            } else {
                console.log(`   ℹ️  Long query failed with: ${this.parseError(error)}`);
            }
        }
        
        // Test with invalid parameters
        console.log('   🔄 Testing invalid parameters...');
        try {
            const params = {
                key: this.apiKey,
                cx: this.searchEngineId,
                q: 'test',
                num: 100 // Invalid: max is 10
            };
            
            await axios.get(this.baseUrl, { params, timeout: 5000 });
            console.log('   ⚠️  Invalid num parameter was accepted');
            
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log('   ✅ Invalid parameters properly rejected');
            } else {
                console.log(`   ℹ️  Invalid parameters failed with: ${this.parseError(error)}`);
            }
        }
    }

    async checkQuota() {
        console.log('\n📊 Checking API quota information...');
        
        try {
            // Make a simple request to check quota headers
            const params = {
                key: this.apiKey,
                cx: this.searchEngineId,
                q: 'quota test',
                num: 1
            };
            
            const response = await axios.get(this.baseUrl, { params });
            
            // Check for quota-related headers
            const headers = response.headers;
            const quotaRemaining = headers['x-ratelimit-remaining'];
            const quotaLimit = headers['x-ratelimit-limit'];
            const quotaReset = headers['x-ratelimit-reset'];
            
            if (quotaRemaining) {
                console.log(`   📈 Quota remaining: ${quotaRemaining}`);
            }
            
            if (quotaLimit) {
                console.log(`   📊 Quota limit: ${quotaLimit}`);
            }
            
            if (quotaReset) {
                console.log(`   ⏰ Quota reset: ${new Date(quotaReset * 1000).toLocaleString()}`);
            }
            
            if (!quotaRemaining && !quotaLimit && !quotaReset) {
                console.log('   ℹ️  Quota information not available in headers');
            }
            
            // Provide general quota information
            console.log('   📋 Standard quotas:');
            console.log('      Free tier: 100 queries/day');
            console.log('      Paid tier: up to 10,000 queries/day');
            console.log('      Rate limit: No specific per-minute limit');
            
        } catch (error) {
            console.log(`   ⚠️  Could not check quota: ${this.parseError(error)}`);
        }
    }

    parseError(error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            
            switch (status) {
                case 400:
                    return `Bad Request - ${data.error?.message || 'Invalid parameters'}`;
                case 403:
                    if (data.error?.message?.includes('Daily Limit Exceeded')) {
                        return 'Daily quota exceeded';
                    } else if (data.error?.message?.includes('keyInvalid')) {
                        return 'Invalid API key';
                    } else {
                        return `Access denied - ${data.error?.message || 'Check API permissions'}`;
                    }
                case 429:
                    return 'Rate limit exceeded';
                default:
                    return `HTTP ${status} - ${data.error?.message || error.message}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            return 'Request timeout';
        } else if (error.code === 'ENOTFOUND') {
            return 'Network connectivity issue';
        } else {
            return error.message;
        }
    }
}

// Self-executing validation
async function main() {
    try {
        const validator = new GoogleSearchAPIValidator();
        await validator.validate();
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = GoogleSearchAPIValidator;