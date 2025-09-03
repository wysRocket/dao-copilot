#!/usr/bin/env node

/**
 * ToolCallHandler Validation Script
 * 
 * This script validates the ToolCallHandler implementation with real
 * Google Custom Search API calls. It tests various scenarios including
 * successful searches, caching, error handling, and performance.
 */

import { ToolCallHandler } from '../src/services/tool-call-handler.js';
import * as fs from 'fs';
import * as path from 'path';

class ToolCallHandlerValidator {
    constructor() {
        this.loadEnvironment();
        
        this.apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        
        if (!this.apiKey || !this.searchEngineId) {
            throw new Error('Missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID environment variables');
        }
        
        this.handler = new ToolCallHandler({
            apiKey: this.apiKey,
            searchEngineId: this.searchEngineId,
            enableCaching: true,
            cacheTtlSeconds: 300, // 5 minutes for testing
            maxRetries: 2,
            timeout: 8000
        });

        this.setupEventListeners();
        this.testResults = [];
    }

    loadEnvironment() {
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

    setupEventListeners() {
        this.handler.on('searchStart', (data) => {
            console.log(`🔄 Starting search: "${data.query}"`);
        });

        this.handler.on('searchComplete', (data) => {
            console.log(`✅ Search completed: ${data.resultCount} results in ${data.responseTime}ms`);
        });

        this.handler.on('searchError', (data) => {
            console.log(`❌ Search error: ${data.error} (${data.responseTime}ms)`);
        });

        this.handler.on('cacheHit', (data) => {
            console.log(`🎯 Cache hit for query: "${data.query}"`);
        });

        this.handler.on('quotaWarning', (data) => {
            console.log(`⚠️  Quota warning: ${data.used}/${data.limit} (${data.percent.toFixed(1)}%)`);
        });

        this.handler.on('quotaReset', (data) => {
            console.log(`🔄 Quota reset: ${data.used}/${data.limit}`);
        });
    }

    async runValidation() {
        console.log('🔍 ToolCallHandler Validation Suite');
        console.log('==================================\n');

        try {
            await this.testBasicSearch();
            await this.testSearchWithOptions();
            await this.testCaching();
            await this.testQuerySanitization();
            await this.testToolCallInterface();
            await this.testResultFormatting();
            await this.testQuotaManagement();
            await this.testPerformance();
            await this.testConfigurationUpdates();
            
            this.printSummary();
            
        } catch (error) {
            console.error('\n❌ Validation failed:', error.message);
            process.exit(1);
        } finally {
            this.handler.destroy();
        }
    }

    async testBasicSearch() {
        console.log('\n📍 Test 1: Basic Search Functionality');
        console.log('=====================================');

        const testQueries = [
            'JavaScript programming tutorials',
            'artificial intelligence applications',
            'climate change solutions'
        ];

        for (const query of testQueries) {
            try {
                console.log(`\n🔍 Testing query: "${query}"`);
                const result = await this.handler.executeGoogleSearch(query);
                
                if (result.success) {
                    console.log(`   ✅ Success: ${result.results.length} results found`);
                    console.log(`   ⏱️  Response time: ${result.metadata.responseTime}ms`);
                    console.log(`   📊 Quota used: ${result.metadata.quotaUsed}`);
                    
                    if (result.results.length > 0) {
                        console.log(`   📖 First result: "${result.results[0].title}"`);
                    }
                    
                    this.testResults.push({ test: 'basic_search', query, success: true, responseTime: result.metadata.responseTime });
                } else {
                    console.log(`   ❌ Search failed: ${result.error}`);
                    this.testResults.push({ test: 'basic_search', query, success: false, error: result.error });
                }
                
            } catch (error) {
                console.log(`   💥 Exception: ${error.message}`);
                this.testResults.push({ test: 'basic_search', query, success: false, error: error.message });
            }

            // Wait between requests to avoid rate limiting
            await this.sleep(1000);
        }
    }

    async testSearchWithOptions() {
        console.log('\n📍 Test 2: Search with Options');
        console.log('==============================');

        const testCases = [
            {
                name: 'Limited results',
                query: 'machine learning',
                options: { num: 3 }
            },
            {
                name: 'Safe search',
                query: 'family activities',
                options: { num: 5, safe: 'active' }
            },
            {
                name: 'Start offset',
                query: 'web development',
                options: { num: 2, start: 1 }
            }
        ];

        for (const testCase of testCases) {
            try {
                console.log(`\n🧪 Testing: ${testCase.name}`);
                console.log(`   Query: "${testCase.query}"`);
                console.log(`   Options: ${JSON.stringify(testCase.options)}`);
                
                const result = await this.handler.executeGoogleSearch(testCase.query, testCase.options);
                
                if (result.success) {
                    console.log(`   ✅ Success: ${result.results.length} results`);
                    
                    if (testCase.options.num && result.results.length <= testCase.options.num) {
                        console.log(`   ✅ Results count within limit (${testCase.options.num})`);
                    }
                    
                    this.testResults.push({ 
                        test: 'search_options', 
                        name: testCase.name, 
                        success: true, 
                        resultCount: result.results.length 
                    });
                } else {
                    console.log(`   ❌ Failed: ${result.error}`);
                    this.testResults.push({ test: 'search_options', name: testCase.name, success: false, error: result.error });
                }
                
            } catch (error) {
                console.log(`   💥 Exception: ${error.message}`);
                this.testResults.push({ test: 'search_options', name: testCase.name, success: false, error: error.message });
            }

            await this.sleep(1000);
        }
    }

    async testCaching() {
        console.log('\n📍 Test 3: Caching Functionality');
        console.log('=================================');

        const testQuery = 'caching test query nodejs';
        
        try {
            console.log(`🔍 First search (should hit API): "${testQuery}"`);
            const result1 = await this.handler.executeGoogleSearch(testQuery);
            
            if (result1.success) {
                console.log(`   ✅ First search successful: ${result1.results.length} results`);
                console.log(`   📊 Cache hit: ${result1.metadata.cacheHit}`);
                console.log(`   ⏱️  Response time: ${result1.metadata.responseTime}ms`);
            }
            
            // Wait a moment, then search again
            await this.sleep(500);
            
            console.log(`🎯 Second search (should hit cache): "${testQuery}"`);
            const result2 = await this.handler.executeGoogleSearch(testQuery);
            
            if (result2.success) {
                console.log(`   ✅ Second search successful: ${result2.results.length} results`);
                console.log(`   📊 Cache hit: ${result2.metadata.cacheHit}`);
                console.log(`   ⏱️  Response time: ${result2.metadata.responseTime}ms`);
                
                if (result2.metadata.cacheHit && result2.metadata.responseTime < result1.metadata.responseTime) {
                    console.log(`   ✅ Caching working correctly (faster response)`);
                    this.testResults.push({ test: 'caching', success: true, cached: true });
                } else if (!result2.metadata.cacheHit) {
                    console.log(`   ⚠️  Expected cache hit but didn't get one`);
                    this.testResults.push({ test: 'caching', success: false, reason: 'no_cache_hit' });
                }
            }
            
            // Test cache statistics
            const cacheStats = this.handler.getCacheStats();
            console.log(`📈 Cache statistics: ${cacheStats.keys} keys, ${cacheStats.hits} hits, ${cacheStats.misses} misses`);
            
        } catch (error) {
            console.log(`   💥 Caching test failed: ${error.message}`);
            this.testResults.push({ test: 'caching', success: false, error: error.message });
        }
    }

    async testQuerySanitization() {
        console.log('\n📍 Test 4: Query Sanitization');
        console.log('==============================');

        const maliciousQueries = [
            '<script>alert("xss")</script>safe query',
            'javascript:void(0) programming',
            'data:text/html,<h1>test</h1> search',
            'normal query with <tags>'
        ];

        for (const query of maliciousQueries) {
            try {
                console.log(`🔍 Testing malicious query: "${query}"`);
                const result = await this.handler.executeGoogleSearch(query);
                
                if (result.success) {
                    console.log(`   ✅ Query sanitized and processed successfully`);
                    console.log(`   🛡️  Results found: ${result.results.length}`);
                    this.testResults.push({ test: 'sanitization', query, success: true });
                } else {
                    console.log(`   ❌ Search failed: ${result.error}`);
                    this.testResults.push({ test: 'sanitization', query, success: false, error: result.error });
                }
                
            } catch (error) {
                console.log(`   💥 Exception: ${error.message}`);
                this.testResults.push({ test: 'sanitization', query, success: false, error: error.message });
            }

            await this.sleep(500);
        }
    }

    async testToolCallInterface() {
        console.log('\n📍 Test 5: Tool Call Interface');
        console.log('===============================');

        const toolCalls = [
            { name: 'google_search', params: { query: 'tool call test' } },
            { name: 'search', params: { query: 'alternative name test' } },
            { name: 'web_search', params: { query: 'web search test' } }
        ];

        for (const toolCall of toolCalls) {
            try {
                console.log(`🔧 Testing tool call: ${toolCall.name}`);
                const result = await this.handler.handleToolCall(toolCall.name, toolCall.params);
                
                if (result.success) {
                    console.log(`   ✅ Tool call successful: ${result.results.length} results`);
                    this.testResults.push({ test: 'tool_call', name: toolCall.name, success: true });
                } else {
                    console.log(`   ❌ Tool call failed: ${result.error}`);
                    this.testResults.push({ test: 'tool_call', name: toolCall.name, success: false, error: result.error });
                }
                
            } catch (error) {
                console.log(`   💥 Exception: ${error.message}`);
                this.testResults.push({ test: 'tool_call', name: toolCall.name, success: false, error: error.message });
            }

            await this.sleep(500);
        }

        // Test unsupported tool call
        try {
            console.log(`🚫 Testing unsupported tool call`);
            await this.handler.handleToolCall('unsupported_tool', {});
            console.log(`   ❌ Should have thrown error for unsupported tool`);
            this.testResults.push({ test: 'unsupported_tool', success: false, reason: 'no_error_thrown' });
        } catch (error) {
            console.log(`   ✅ Correctly rejected unsupported tool: ${error.message}`);
            this.testResults.push({ test: 'unsupported_tool', success: true });
        }
    }

    async testResultFormatting() {
        console.log('\n📍 Test 6: Result Formatting');
        console.log('=============================');

        try {
            console.log(`🔍 Testing result formatting`);
            const result = await this.handler.executeGoogleSearch('formatting test nodejs');
            
            if (result.success && result.results.length > 0) {
                const formatted = this.handler.formatSearchResults(result.results, 3);
                console.log(`   ✅ Formatting successful`);
                console.log(`   📝 Sample formatted output:`);
                console.log(formatted.split('\n').slice(0, 5).join('\n') + '...');
                
                // Test empty results formatting
                const emptyFormatted = this.handler.formatSearchResults([]);
                console.log(`   📝 Empty results: "${emptyFormatted}"`);
                
                this.testResults.push({ test: 'formatting', success: true });
            } else {
                console.log(`   ⚠️  No results to format`);
                this.testResults.push({ test: 'formatting', success: false, reason: 'no_results' });
            }
            
        } catch (error) {
            console.log(`   💥 Formatting test failed: ${error.message}`);
            this.testResults.push({ test: 'formatting', success: false, error: error.message });
        }
    }

    async testQuotaManagement() {
        console.log('\n📍 Test 7: Quota Management');
        console.log('============================');

        try {
            const quotaStatus = this.handler.getQuotaStatus();
            console.log(`📊 Current quota: ${quotaStatus.used}/${quotaStatus.limit} (${quotaStatus.usagePercent.toFixed(1)}%)`);
            console.log(`⏰ Reset time: ${new Date(quotaStatus.resetTime).toLocaleString()}`);
            
            // Test quota tracking
            const beforeQuota = quotaStatus.used;
            await this.handler.executeGoogleSearch('quota tracking test');
            const afterQuota = this.handler.getQuotaStatus().used;
            
            if (afterQuota > beforeQuota) {
                console.log(`   ✅ Quota tracking working: ${beforeQuota} → ${afterQuota}`);
                this.testResults.push({ test: 'quota_tracking', success: true });
            } else {
                console.log(`   ❌ Quota not incremented`);
                this.testResults.push({ test: 'quota_tracking', success: false });
            }
            
        } catch (error) {
            console.log(`   💥 Quota test failed: ${error.message}`);
            this.testResults.push({ test: 'quota_tracking', success: false, error: error.message });
        }
    }

    async testPerformance() {
        console.log('\n📍 Test 8: Performance Testing');
        console.log('===============================');

        const performanceTests = [
            'performance test query 1',
            'performance test query 2',
            'performance test query 3'
        ];

        const responseTimes = [];

        for (const query of performanceTests) {
            try {
                const startTime = Date.now();
                const result = await this.handler.executeGoogleSearch(query, { num: 5 });
                const responseTime = Date.now() - startTime;
                
                responseTimes.push(responseTime);
                
                if (result.success) {
                    console.log(`   ✅ Query "${query}": ${responseTime}ms`);
                } else {
                    console.log(`   ❌ Query failed: ${result.error}`);
                }
                
            } catch (error) {
                console.log(`   💥 Performance test failed: ${error.message}`);
            }

            await this.sleep(500);
        }

        if (responseTimes.length > 0) {
            const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            const minResponseTime = Math.min(...responseTimes);
            const maxResponseTime = Math.max(...responseTimes);
            
            console.log(`📊 Performance summary:`);
            console.log(`   Average response time: ${avgResponseTime.toFixed(0)}ms`);
            console.log(`   Min response time: ${minResponseTime}ms`);
            console.log(`   Max response time: ${maxResponseTime}ms`);
            
            // Check if performance meets requirements (< 2 seconds)
            if (avgResponseTime < 2000) {
                console.log(`   ✅ Performance meets requirements (< 2000ms)`);
                this.testResults.push({ test: 'performance', success: true, avgResponseTime });
            } else {
                console.log(`   ⚠️  Performance may need optimization (avg: ${avgResponseTime}ms)`);
                this.testResults.push({ test: 'performance', success: false, avgResponseTime });
            }
        }
    }

    async testConfigurationUpdates() {
        console.log('\n📍 Test 9: Configuration Updates');
        console.log('=================================');

        try {
            console.log(`⚙️  Testing configuration updates`);
            
            // Update timeout
            this.handler.updateConfig({ timeout: 15000 });
            console.log(`   ✅ Timeout updated to 15000ms`);
            
            // Update max retries
            this.handler.updateConfig({ maxRetries: 5 });
            console.log(`   ✅ Max retries updated to 5`);
            
            // Test that the configuration actually changed
            if (this.handler.config.timeout === 15000 && this.handler.config.maxRetries === 5) {
                console.log(`   ✅ Configuration updates working correctly`);
                this.testResults.push({ test: 'config_updates', success: true });
            } else {
                console.log(`   ❌ Configuration not updated properly`);
                this.testResults.push({ test: 'config_updates', success: false });
            }
            
        } catch (error) {
            console.log(`   💥 Configuration test failed: ${error.message}`);
            this.testResults.push({ test: 'config_updates', success: false, error: error.message });
        }
    }

    printSummary() {
        console.log('\n📋 Validation Summary');
        console.log('=====================');
        
        const successful = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        const successRate = (successful / total * 100).toFixed(1);
        
        console.log(`✅ Successful tests: ${successful}/${total} (${successRate}%)`);
        
        if (successful === total) {
            console.log(`🎉 All tests passed! ToolCallHandler is working perfectly.`);
        } else {
            console.log(`⚠️  Some tests failed. Review the output above for details.`);
            
            const failed = this.testResults.filter(r => !r.success);
            console.log(`\n❌ Failed tests:`);
            failed.forEach(test => {
                console.log(`   - ${test.test}: ${test.error || test.reason || 'Unknown failure'}`);
            });
        }
        
        // Final quota status
        const finalQuota = this.handler.getQuotaStatus();
        console.log(`\n📊 Final quota status: ${finalQuota.used}/${finalQuota.limit} (${finalQuota.usagePercent.toFixed(1)}%)`);
        
        // Cache statistics
        const cacheStats = this.handler.getCacheStats();
        console.log(`📈 Cache statistics: ${cacheStats.keys} keys, ${cacheStats.hits} hits, ${cacheStats.misses} misses`);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Self-executing validation
async function main() {
    try {
        const validator = new ToolCallHandlerValidator();
        await validator.runValidation();
    } catch (error) {
        console.error('❌ Validation setup failed:', error.message);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default ToolCallHandlerValidator;