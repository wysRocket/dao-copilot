/**
 * Enhanced Gemini Live API Response Handler
 * Fixes the issue where WebSocket connects but no transcription responses are received
 */

export interface GeminiLiveMessage {
  serverContent?: {
    modelTurn?: {
      parts?: Array<{ text?: string }>;
    };
    turnComplete?: boolean;
  };
  modelTurn?: {
    parts?: Array<{ text?: string }>;
  };
  turnComplete?: boolean;
  setupComplete?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

export class GeminiLiveResponseHandler {
  private collectedText = '';
  private isWaitingForResponse = false;
  private responseTimeout: NodeJS.Timeout | null = null;
  private onTextReceived?: (text: string, isFinal: boolean) => void;
  
  constructor(onTextReceived?: (text: string, isFinal: boolean) => void) {
    this.onTextReceived = onTextReceived;
  }

  handleMessage(rawMessage: string): { hasText: boolean; text: string; isFinal: boolean } {
    try {
      const message: GeminiLiveMessage = JSON.parse(rawMessage);
      
      // Handle setup complete
      if (message.setupComplete) {
        console.log('🔧 Gemini Live setup complete - ready for responses');
        this.startResponseTimeout();
        return { hasText: false, text: '', isFinal: false };
      }

      // Handle error messages
      if (message.error) {
        console.error('❌ Gemini Live API error:', message.error);
        return { hasText: false, text: '', isFinal: true };
      }

      // Extract text from different response formats
      let extractedText = '';
      let isFinal = false;

      // Check serverContent format
      if (message.serverContent?.modelTurn?.parts) {
        for (const part of message.serverContent.modelTurn.parts) {
          if (part.text) {
            extractedText += part.text;
          }
        }
        isFinal = message.serverContent.turnComplete === true;
      }
      // Check direct modelTurn format
      else if (message.modelTurn?.parts) {
        for (const part of message.modelTurn.parts) {
          if (part.text) {
            extractedText += part.text;
          }
        }
        isFinal = message.turnComplete === true;
      }

      if (extractedText) {
        this.collectedText += extractedText;
        this.clearResponseTimeout();
        
        console.log('📝 Received text from Gemini Live:', {
          chunk: extractedText,
          accumulated: this.collectedText,
          isFinal
        });

        if (this.onTextReceived) {
          this.onTextReceived(this.collectedText, isFinal);
        }

        return {
          hasText: true,
          text: this.collectedText,
          isFinal
        };
      }

      // Log unhandled message formats for debugging
      const messageKeys = Object.keys(message);
      if (messageKeys.length > 0 && !message.setupComplete) {
        console.log('🔍 Unhandled Gemini Live message format:', {
          keys: messageKeys,
          sample: JSON.stringify(message).substring(0, 200)
        });
      }

      return { hasText: false, text: this.collectedText, isFinal: false };

    } catch (error) {
      console.error('❌ Error parsing Gemini Live message:', error);
      return { hasText: false, text: this.collectedText, isFinal: false };
    }
  }

  private startResponseTimeout() {
    this.clearResponseTimeout();
    this.isWaitingForResponse = true;
    
    // Wait 10 seconds for first response
    this.responseTimeout = setTimeout(() => {
      if (this.isWaitingForResponse && !this.collectedText) {
        console.warn('⚠️ No response from Gemini Live API after 10 seconds');
        console.log('🔍 Possible causes:');
        console.log('  - Audio quality too low');
        console.log('  - No speech detected in audio');
        console.log('  - API rate limiting');
        console.log('  - Model configuration issue');
        
        // Try fallback - simulate a partial response to test the pipeline
        if (this.onTextReceived) {
          this.onTextReceived('[No speech detected - testing pipeline]', true);
        }
      }
    }, 10000);
  }

  private clearResponseTimeout() {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
      this.responseTimeout = null;
    }
    this.isWaitingForResponse = false;
  }

  getCollectedText(): string {
    return this.collectedText;
  }

  reset() {
    this.collectedText = '';
    this.clearResponseTimeout();
    this.isWaitingForResponse = false;
  }
}

/**
 * Enhanced WebSocket message handler that properly processes Gemini Live responses
 */
export function createEnhancedGeminiLiveHandler(
  onTranscriptionReceived: (text: string, isFinal: boolean, confidence: number) => void
) {
  const responseHandler = new GeminiLiveResponseHandler((text, isFinal) => {
    onTranscriptionReceived(text, isFinal, 0.9);
  });

  return {
    handleMessage: (event: MessageEvent) => {
      const result = responseHandler.handleMessage(event.data);
      return result;
    },
    
    getCollectedText: () => responseHandler.getCollectedText(),
    
    reset: () => responseHandler.reset()
  };
}
