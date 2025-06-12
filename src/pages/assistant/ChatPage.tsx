import React, {useState} from 'react';

export default function ChatPage() {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<
    Array<{
      id: string;
      type: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>
  >([]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const userMessage = {
      id: `msg-${Date.now()}`,
      type: 'user' as const,
      content: message,
      timestamp: Date.now(),
    };

    setChatHistory((prev) => [...prev, userMessage]);
    setMessage('');

    // TODO: Integrate with AI service
    setTimeout(() => {
      const assistantMessage = {
        id: `msg-${Date.now()}-assistant`,
        type: 'assistant' as const,
        content: `I received your message: "${message}". This is a placeholder response.`,
        timestamp: Date.now(),
      };
      setChatHistory((prev) => [...prev, assistantMessage]);
    }, 1000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">AI Chat Assistant</h2>
        <p className="text-muted-foreground text-sm">
          Ask questions about your transcripts or get general assistance
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {chatHistory.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            <p>Start a conversation with your AI assistant.</p>
            <p className="mt-2 text-xs">
              You can ask about your transcripts or get general help.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.type === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-card border'
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p
                    className={`mt-1 text-xs ${
                      msg.type === 'user'
                        ? 'text-blue-100'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="border-t p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
