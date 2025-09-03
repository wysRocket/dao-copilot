#!/usr/bin/env node

/**
 * ToolCallHandler Integration Example
 * 
 * This example demonstrates how to integrate the ToolCallHandler with
 * the existing question detection system to create a complete AI
 * answering machine workflow.
 */

import { ToolCallHandler } from '../src/services/tool-call-handler.js';
import { QuestionDetector } from '../src/services/question-detector.js';
import { TranscriptionQuestionPipeline } from '../src/services/transcription-question-pipeline.js';
import { MultiPartQuestionProcessor } from '../src/services/multi-part-question-processor.js';
import * as fs from 'fs';
import * as path from 'path';

class AIAnsweringMachineDemo {
    constructor() {
        this.loadEnvironment();
        this.initializeComponents();
        this.setupEventHandlers();
        this.isProcessing = false;
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

    initializeComponents() {
        // Initialize Question Detection System
        this.questionDetector = new QuestionDetector();
        this.multiPartProcessor = new MultiPartQuestionProcessor();
        
        // Initialize Tool Call Handler
        const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
        
        if (!apiKey || !searchEngineId) {
            throw new Error('Missing Google Search API credentials. Please set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in your .env file.');
        }

        this.toolCallHandler = new ToolCallHandler({
            apiKey,
            searchEngineId,
            enableCaching: true,
            cacheTtlSeconds: 1800, // 30 minutes
            maxRetries: 3,
            timeout: 8000,
            security: {
                sanitizeQueries: true,
                maxQueryLength: 2048
            }
        });

        // Initialize Transcription Pipeline
        this.pipeline = new TranscriptionQuestionPipeline({
            questionDetector: this.questionDetector,
            bufferTimeMs: 1500, // 1.5 seconds buffer
            minConfidence: 0.7,
            enableContextProcessing: true,
            conversationHistoryLimit: 20
        });
    }

    setupEventHandlers() {
        // Question Detection Events
        this.pipeline.on('questionDetected', async (event) => {
            console.log(`❓ Question detected: "${event.text}"`);
            console.log(`   Type: ${event.questionType}`);
            console.log(`   Confidence: ${(event.confidence * 100).toFixed(1)}%`);
            
            await this.handleDetectedQuestion(event);
        });

        // Tool Call Events
        this.toolCallHandler.on('searchStart', (data) => {
            console.log(`🔍 Searching: "${data.query}"`);
        });

        this.toolCallHandler.on('searchComplete', (data) => {
            console.log(`✅ Search completed: ${data.resultCount} results in ${data.responseTime}ms`);
        });

        this.toolCallHandler.on('searchError', (data) => {
            console.log(`❌ Search error: ${data.error}`);
        });

        this.toolCallHandler.on('cacheHit', (data) => {
            console.log(`⚡ Cache hit for: "${data.query}"`);
        });

        this.toolCallHandler.on('quotaWarning', (data) => {
            console.log(`⚠️  Quota warning: ${data.used}/${data.limit} (${data.percent.toFixed(1)}%)`);
        });
    }

    async handleDetectedQuestion(questionEvent) {
        if (this.isProcessing) {
            console.log(`⏸️  Skipping question (already processing): "${questionEvent.text}"`);
            return;
        }

        this.isProcessing = true;

        try {
            // Process multi-part questions if needed
            const processedQuestions = await this.processMultiPartQuestion(questionEvent);
            
            // Handle each question part
            for (const question of processedQuestions) {
                await this.searchAndDisplayAnswer(question);
                
                // Brief pause between multi-part answers
                if (processedQuestions.length > 1) {
                    await this.sleep(1000);
                }
            }
            
        } catch (error) {
            console.error(`💥 Error handling question: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    async processMultiPartQuestion(questionEvent) {
        const conversationHistory = this.pipeline.getConversationHistory();
        
        const multiPartResult = await this.multiPartProcessor.processQuestion(
            questionEvent.text,
            conversationHistory.slice(-5) // Use last 5 conversation items for context
        );

        if (multiPartResult.isMultiPart) {
            console.log(`🔍 Multi-part question detected:`);
            console.log(`   Strategy: ${multiPartResult.processingStrategy}`);
            console.log(`   Parts: ${multiPartResult.parts.length}`);
            
            return multiPartResult.parts.map(part => ({
                ...questionEvent,
                text: part.question,
                originalText: questionEvent.text,
                partIndex: part.id,
                isMultiPart: true,
                dependencies: part.dependencies
            }));
        }

        return [questionEvent];
    }

    async searchAndDisplayAnswer(questionEvent) {
        try {
            console.log(`\n🤖 Processing question: "${questionEvent.text}"`);
            
            // Extract search query from the question
            const searchQuery = this.extractSearchQuery(questionEvent.text);
            console.log(`🔍 Search query: "${searchQuery}"`);

            // Perform search
            const startTime = Date.now();
            const searchResult = await this.toolCallHandler.executeGoogleSearch(
                searchQuery, 
                { num: 8, safe: 'active' }
            );
            
            if (searchResult.success) {
                const responseTime = Date.now() - startTime;
                console.log(`⏱️  Total response time: ${responseTime}ms`);
                
                // Display formatted answer
                this.displayAnswer(questionEvent, searchResult);
                
                // Update conversation history
                this.updateConversationHistory(questionEvent, searchResult);
                
            } else {
                console.log(`❌ Search failed: ${searchResult.error}`);
                this.displayFallbackAnswer(questionEvent);
            }
            
        } catch (error) {
            console.error(`💥 Error searching for answer: ${error.message}`);
            this.displayFallbackAnswer(questionEvent);
        }
    }

    extractSearchQuery(questionText) {
        // Remove question words and clean up the query
        let query = questionText
            .replace(/^(what|how|when|where|why|who|which|can|could|would|should|is|are|do|does|did)\s+/i, '')
            .replace(/\?+$/, '')
            .replace(/\s+/g, ' ')
            .trim();

        // If query is too short or empty, use the original text
        if (query.length < 3) {
            query = questionText.replace(/\?+$/, '').trim();
        }

        return query;
    }

    displayAnswer(questionEvent, searchResult) {
        console.log(`\n📝 Answer for: "${questionEvent.text}"`);
        console.log('=' + '='.repeat(questionEvent.text.length + 15));
        
        if (searchResult.results && searchResult.results.length > 0) {
            // Display top 3 results as answer
            const topResults = searchResult.results.slice(0, 3);
            
            console.log(`Based on my search, here are the top answers:\n`);
            
            topResults.forEach((result, index) => {
                console.log(`${index + 1}. **${result.title}**`);
                console.log(`   ${result.snippet}`);
                console.log(`   🔗 ${result.link}\n`);
            });
            
            // Show total results available
            if (searchResult.results.length > 3) {
                console.log(`💡 Found ${searchResult.results.length} total results. Showing top 3.`);
            }
            
            // Show search metadata
            console.log(`📊 Search metadata:`);
            console.log(`   Response time: ${searchResult.metadata.responseTime}ms`);
            console.log(`   Source: ${searchResult.metadata.source}`);
            console.log(`   Cache hit: ${searchResult.metadata.cacheHit ? 'Yes' : 'No'}`);
            console.log(`   Quota used: ${searchResult.metadata.quotaUsed}`);
        } else {
            console.log(`No specific results found for this question.`);
        }
    }

    displayFallbackAnswer(questionEvent) {
        console.log(`\n🤔 Unable to find answer for: "${questionEvent.text}"`);
        console.log(`I'm sorry, I couldn't find relevant information to answer your question at this time.`);
        console.log(`This could be due to:
   - Network connectivity issues
   - API quota limitations  
   - The question might need to be rephrased
   - The topic might be too specific or recent\n`);
    }

    updateConversationHistory(questionEvent, searchResult) {
        // Add both question and answer to conversation context
        this.pipeline.addToConversationHistory({
            type: 'question',
            text: questionEvent.text,
            timestamp: Date.now(),
            answered: searchResult.success
        });

        if (searchResult.success && searchResult.results.length > 0) {
            this.pipeline.addToConversationHistory({
                type: 'answer',
                text: `Found ${searchResult.results.length} results about "${questionEvent.text}"`,
                timestamp: Date.now(),
                source: 'google_search'
            });
        }
    }

    // Demo function to simulate transcription input
    async simulateTranscription(text) {
        console.log(`🎤 Simulating transcription: "${text}"`);
        
        // Process the transcription through the pipeline
        this.pipeline.processTranscript({
            transcript: text,
            isFinal: true,
            confidence: 0.9
        });
    }

    async runDemo() {
        console.log('🤖 AI Answering Machine Integration Demo');
        console.log('=========================================\n');
        
        console.log('This demo shows how the ToolCallHandler integrates with');
        console.log('the question detection system to create a complete AI answering machine.\n');

        // Show current quota status
        const quotaStatus = this.toolCallHandler.getQuotaStatus();
        console.log(`📊 Current API quota: ${quotaStatus.used}/${quotaStatus.limit} (${quotaStatus.usagePercent.toFixed(1)}%)\n`);

        // Demo questions to test
        const demoQuestions = [
            "What is artificial intelligence?",
            "How does machine learning work?",
            "What are the benefits of renewable energy and what are the main types?", // Multi-part
            "When was JavaScript created?",
            "What is the weather like today?",
            "How do I learn programming and which language should I start with?" // Multi-part
        ];

        console.log(`🧪 Testing with ${demoQuestions.length} demo questions...\n`);

        for (let i = 0; i < demoQuestions.length; i++) {
            const question = demoQuestions[i];
            
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Demo ${i + 1}/${demoQuestions.length}`);
            console.log(`${'='.repeat(60)}`);
            
            await this.simulateTranscription(question);
            
            // Wait for processing to complete
            while (this.isProcessing) {
                await this.sleep(100);
            }
            
            // Pause between demos
            if (i < demoQuestions.length - 1) {
                console.log(`\n⏸️  Pausing for 3 seconds before next demo...`);
                await this.sleep(3000);
            }
        }

        // Show final statistics
        console.log(`\n📈 Demo Statistics:`);
        const finalQuota = this.toolCallHandler.getQuotaStatus();
        console.log(`   Quota used: ${finalQuota.used}/${finalQuota.limit} (${finalQuota.usagePercent.toFixed(1)}%)`);
        
        const cacheStats = this.toolCallHandler.getCacheStats();
        console.log(`   Cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses`);
        
        const historyLength = this.pipeline.getConversationHistory().length;
        console.log(`   Conversation items: ${historyLength}`);

        console.log(`\n🎉 Demo completed successfully!`);
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    destroy() {
        if (this.toolCallHandler) {
            this.toolCallHandler.destroy();
        }
        if (this.pipeline) {
            this.pipeline.destroy();
        }
    }
}

// Self-executing demo
async function main() {
    let demo;
    
    try {
        demo = new AIAnsweringMachineDemo();
        await demo.runDemo();
        
    } catch (error) {
        console.error('❌ Demo failed:', error.message);
        
        if (error.message.includes('Missing Google Search API credentials')) {
            console.log(`\n🔧 Setup required:`);
            console.log(`   1. Run: node scripts/setup-google-search-api.js`);
            console.log(`   2. Or manually set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in .env`);
            console.log(`   3. Then run this demo again`);
        }
        
        process.exit(1);
    } finally {
        if (demo) {
            demo.destroy();
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default AIAnsweringMachineDemo;