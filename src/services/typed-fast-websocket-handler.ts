interface GeminiResponse {
  confidence?: number;
  server_content?: {
    model_turn?: {
      parts?: Array<{ text?: string }>;
    };
  };
  model_turn?: {
    parts?: Array<{ text?: string }>;
  };
  [key: string]: unknown;
}

interface WindowManager {
  broadcastToAllWindows: (event: string, type: string, data: Record<string, unknown>) => void;
}

export const createTypedFastWebSocketHandler = (
  audioSent: () => boolean,
  startTime: number,
  windowManager: WindowManager
) => {
  return (message: MessageEvent) => {
    try {
      const messageData = JSON.parse(message.data);
      
      if (messageData?.geminiResponse) {
        if (!audioSent()) return;
        
        const resp = messageData.geminiResponse as GeminiResponse;
        let text = '';
        let confidence = 0.8;

        // Extract text from response
        if (resp.server_content?.model_turn?.parts) {
          confidence = resp.confidence || 0.8;
          for (const part of resp.server_content.model_turn.parts) {
            if (part.text) text += part.text;
          }
        } else if (resp.model_turn?.parts) {
          confidence = resp.confidence || 0.8;
          for (const part of resp.model_turn.parts) {
            if (part.text) text += part.text;
          }
        }

        if (text) {
          windowManager.broadcastToAllWindows('app:message', 'transcription_chunk', {
            isPartial: false,
            timestamp: Date.now() - startTime,
            confidence,
            text: text.trim()
          });
        }
      }
    } catch (error) {
      console.warn('WebSocket message processing error:', error);
    }
  };
};
