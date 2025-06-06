import React, {useState, useEffect, useRef} from 'react';
import {useAIAssistant, useFeatures} from '../../contexts/AppContext';

export default function AIAssistantPortal() {
  const {
    isVisible,
    query,
    response,
    isLoading,
    setQuery,
    setResponse,
    setLoading,
    toggleVisibility,
  } = useAIAssistant();
  const {features, toggleFeature} = useFeatures();
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Focus input when visible
  useEffect(() => {
    if (isVisible && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isVisible]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const question = inputValue.trim();
    setQuery(question);
    setInputValue('');
    setLoading(true);

    try {
      // Simulate AI response - replace with actual AI service call
      setResponse(''); // Clear previous response

      // Simulate streaming response
      const simulatedResponse = `I understand you're asking about "${question}". This is a simulated response from the AI assistant. 

In a real implementation, this would connect to your preferred AI service (OpenAI GPT, Anthropic Claude, etc.) to provide intelligent responses based on your query and the context from screen monitoring and audio transcription.

The AI assistant is designed to help with:
• Analyzing transcribed conversations
• Providing insights from screen content
• Offering proactive suggestions
• Answering questions about your workflow`;

      // Simulate streaming effect
      let currentText = '';
      const words = simulatedResponse.split(' ');

      for (let i = 0; i < words.length; i++) {
        currentText += (i > 0 ? ' ' : '') + words[i];
        setResponse(currentText);
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate typing delay
      }
    } catch (error) {
      console.error('AI request failed:', error);
      setResponse(
        'Sorry, I encountered an error while processing your request. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      // Create a synthetic form event
      const formEvent = new Event('submit', {
        bubbles: true,
        cancelable: true,
      }) as unknown as React.FormEvent;
      handleSubmit(formEvent);
    }
  };

  return (
    <div className="bg-background/95 flex h-full w-full flex-col backdrop-blur-md">
      {/* Header */}
      <div className="border-border/50 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary"
          >
            <path d="M12 2L2 7L12 12L22 7L12 2Z" />
            <path d="M2 17L12 22L22 17" />
            <path d="M2 12L12 17L22 12" />
          </svg>
          <h2 className="text-foreground text-sm font-semibold">Ask AI</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleVisibility}
            title="Hide AI Assistant"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Features Status */}
      <div className="border-border/50 border-b px-4 py-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${features.screenMonitoring ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-muted-foreground">Screen Monitoring</span>
            <button
              onClick={() => toggleFeature('screenMonitoring')}
              className="text-primary hover:text-primary/80 ml-1"
            >
              {features.screenMonitoring ? 'On' : 'Off'}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${features.audioListening ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-muted-foreground">Audio Listening</span>
            <button
              onClick={() => toggleFeature('audioListening')}
              className="text-primary hover:text-primary/80 ml-1"
            >
              {features.audioListening ? 'On' : 'Off'}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${features.proactiveAssistance ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-muted-foreground">Proactive</span>
            <button
              onClick={() => toggleFeature('proactiveAssistance')}
              className="text-primary hover:text-primary/80 ml-1"
            >
              {features.proactiveAssistance ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </div>

      {/* AI Response Section */}
      <div className="flex-1 overflow-y-auto p-4">
        {!response && !isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-muted-foreground mx-auto mb-3"
              >
                <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                <path d="M2 17L12 22L22 17" />
                <path d="M2 12L12 17L22 12" />
              </svg>
              <h3 className="text-foreground mb-2 text-lg font-semibold">
                Welcome to Cluely AI
              </h3>
              <p className="text-muted-foreground mb-4 text-sm">
                I&apos;m your intelligent assistant, ready to help with insights
                from your screen and audio.
              </p>
              <div className="space-y-2 text-left">
                <div className="flex items-start gap-2">
                  <div className="bg-primary mt-2 h-2 w-2 rounded-full" />
                  <span className="text-muted-foreground text-sm">
                    Screen monitoring and analysis
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="bg-primary mt-2 h-2 w-2 rounded-full" />
                  <span className="text-muted-foreground text-sm">
                    Audio transcription and understanding
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="bg-primary mt-2 h-2 w-2 rounded-full" />
                  <span className="text-muted-foreground text-sm">
                    Proactive assistance and suggestions
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {query && (
              <div className="bg-primary/10 border-primary/20 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary mt-0.5"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <p className="text-foreground text-sm">{query}</p>
                </div>
              </div>
            )}

            {(response || isLoading) && (
              <div className="bg-card border-border/30 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary mt-0.5"
                  >
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                    <path d="M2 17L12 22L22 17" />
                    <path d="M2 12L12 17L22 12" />
                  </svg>
                  <div className="flex-1">
                    {isLoading && !response ? (
                      <div className="flex items-center gap-2">
                        <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
                        <span className="text-muted-foreground text-sm">
                          Thinking...
                        </span>
                      </div>
                    ) : (
                      <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                        {response}
                        {isLoading && (
                          <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="border-border/50 border-t p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your screen or audio..."
              className="bg-background border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 focus:border-primary/50 max-h-[120px] min-h-[40px] w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              disabled={isLoading}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              Press ⌘ + Enter to send
            </span>
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  Thinking...
                </>
              ) : (
                <>
                  Send
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
