#!/usr/bin/env node

/**
 * Google Custom Search API Setup Script
 * 
 * This script helps set up the Google Custom Search API credentials
 * and configuration for the AI Answering Machine project.
 * 
 * Prerequisites:
 * 1. Google Cloud Project with Custom Search API enabled
 * 2. Custom Search Engine created
 * 3. API Key generated
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class GoogleSearchAPISetup {
    constructor() {
        this.envPath = path.join(process.cwd(), '.env');
        this.configPath = path.join(process.cwd(), 'google-search-config.json');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async run() {
        console.log('🔍 Google Custom Search API Setup');
        console.log('===================================\n');

        try {
            await this.checkPrerequisites();
            await this.gatherCredentials();
            await this.createConfiguration();
            await this.testAPIConnection();
            console.log('\n✅ Setup complete! Google Custom Search API is ready to use.');
        } catch (error) {
            console.error('\n❌ Setup failed:', error.message);
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    async checkPrerequisites() {
        console.log('📋 Checking prerequisites...\n');

        const steps = [
            {
                name: 'Google Cloud Project',
                description: 'Created a Google Cloud project with Custom Search API enabled',
                url: 'https://console.cloud.google.com/'
            },
            {
                name: 'Custom Search Engine',
                description: 'Created a Programmable Search Engine',
                url: 'https://programmablesearchengine.google.com/'
            },
            {
                name: 'API Key',
                description: 'Generated an API key in Google Cloud Console > Credentials',
                url: 'https://console.cloud.google.com/apis/credentials'
            }
        ];

        for (const step of steps) {
            console.log(`   ${step.name}: ${step.description}`);
            console.log(`   📖 Guide: ${step.url}\n`);
        }

        const confirmed = await this.askQuestion(
            'Have you completed all the above prerequisites? (y/n): '
        );

        if (confirmed.toLowerCase() !== 'y' && confirmed.toLowerCase() !== 'yes') {
            throw new Error('Please complete the prerequisites before running this setup.');
        }
    }

    async gatherCredentials() {
        console.log('\n🔑 Gathering API credentials...\n');

        const apiKey = await this.askQuestion('Enter your Google Custom Search API Key: ');
        if (!apiKey || apiKey.length < 30) {
            throw new Error('Invalid API key. API keys should be at least 30 characters long.');
        }

        const searchEngineId = await this.askQuestion('Enter your Custom Search Engine ID: ');
        if (!searchEngineId || searchEngineId.length < 10) {
            throw new Error('Invalid Search Engine ID. IDs should be at least 10 characters long.');
        }

        this.credentials = {
            apiKey: apiKey.trim(),
            searchEngineId: searchEngineId.trim()
        };
    }

    async createConfiguration() {
        console.log('\n⚙️  Creating configuration files...\n');

        // Update .env file
        await this.updateEnvFile();
        
        // Create configuration file
        await this.createConfigFile();

        console.log('   ✅ Configuration files created');
    }

    async updateEnvFile() {
        let envContent = '';
        
        // Read existing .env if it exists
        if (fs.existsSync(this.envPath)) {
            envContent = fs.readFileSync(this.envPath, 'utf-8');
        }

        // Remove existing Google Search API entries
        envContent = envContent
            .split('\n')
            .filter(line => !line.startsWith('GOOGLE_SEARCH_API_KEY=') && 
                          !line.startsWith('GOOGLE_SEARCH_ENGINE_ID='))
            .join('\n');

        // Add new entries
        if (!envContent.endsWith('\n') && envContent.length > 0) {
            envContent += '\n';
        }
        
        envContent += `\n# Google Custom Search API Configuration\n`;
        envContent += `GOOGLE_SEARCH_API_KEY=${this.credentials.apiKey}\n`;
        envContent += `GOOGLE_SEARCH_ENGINE_ID=${this.credentials.searchEngineId}\n`;

        fs.writeFileSync(this.envPath, envContent);
        console.log(`   📝 Updated ${this.envPath}`);
    }

    async createConfigFile() {
        const config = {
            version: "1.0.0",
            api: {
                name: "Google Custom Search API",
                version: "v1",
                baseUrl: "https://www.googleapis.com/customsearch/v1"
            },
            rateLimits: {
                free: {
                    dailyLimit: 100,
                    intervalMs: 24 * 60 * 60 * 1000 // 24 hours
                },
                paid: {
                    dailyLimit: 10000,
                    intervalMs: 24 * 60 * 60 * 1000 // 24 hours
                }
            },
            defaultSearchOptions: {
                num: 10, // Number of results per page
                safe: "active", // Safe search level
                fileType: "", // Filter by file type (empty = all)
                rights: "", // Usage rights filter
                imgType: "", // Image type filter
                imgSize: "", // Image size filter
                imgDominantColor: "", // Image dominant color filter
                imgColorType: "" // Image color type filter
            },
            caching: {
                enabled: true,
                ttlSeconds: 3600, // 1 hour
                maxEntries: 1000
            },
            errorHandling: {
                maxRetries: 3,
                retryDelayMs: 1000,
                exponentialBackoff: true
            },
            security: {
                sanitizeQueries: true,
                maxQueryLength: 2048,
                allowedDomains: [], // Empty = all domains allowed
                blockedDomains: []
            }
        };

        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        console.log(`   📝 Created ${this.configPath}`);
    }

    async testAPIConnection() {
        console.log('\n🧪 Testing API connection...\n');

        const axios = require('axios').default;
        
        try {
            const testQuery = 'test search';
            const url = 'https://www.googleapis.com/customsearch/v1';
            const params = {
                key: this.credentials.apiKey,
                cx: this.credentials.searchEngineId,
                q: testQuery,
                num: 1
            };

            console.log('   🔄 Making test API call...');
            const response = await axios.get(url, { params, timeout: 10000 });
            
            if (response.data && response.data.items) {
                console.log(`   ✅ API test successful! Found ${response.data.items.length} result(s)`);
                console.log(`   📊 Search Information: ${response.data.searchInformation?.formattedTotalResults || 'N/A'} total results`);
                
                if (response.data.items[0]) {
                    console.log(`   🎯 Sample result: "${response.data.items[0].title}"`);
                }
            } else {
                console.log('   ⚠️  API test completed but no results found');
            }

            // Check quota information if available
            const quotaHeader = response.headers['x-ratelimit-remaining'];
            if (quotaHeader) {
                console.log(`   📈 Remaining quota: ${quotaHeader}`);
            }

        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;
                
                switch (status) {
                    case 400:
                        throw new Error(`Bad Request: ${data.error?.message || 'Invalid request parameters'}`);
                    case 403:
                        if (data.error?.message?.includes('Daily Limit Exceeded')) {
                            throw new Error('Daily quota exceeded. Please try again tomorrow or upgrade to a paid plan.');
                        } else {
                            throw new Error(`Access Denied: ${data.error?.message || 'Check your API key permissions'}`);
                        }
                    case 429:
                        throw new Error('Rate limit exceeded. Please wait before making more requests.');
                    default:
                        throw new Error(`API Error (${status}): ${data.error?.message || error.message}`);
                }
            } else if (error.code === 'ECONNABORTED') {
                throw new Error('API request timed out. Please check your internet connection.');
            } else {
                throw new Error(`Network error: ${error.message}`);
            }
        }
    }

    askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    }

    static async checkDependencies() {
        try {
            require('axios');
        } catch (error) {
            console.log('📦 Installing required dependencies...');
            const { execSync } = require('child_process');
            execSync('npm install axios', { stdio: 'inherit' });
        }
    }
}

// Self-executing setup
async function main() {
    try {
        await GoogleSearchAPISetup.checkDependencies();
        const setup = new GoogleSearchAPISetup();
        await setup.run();
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = GoogleSearchAPISetup;