import React, {useState} from 'react';
import {useAIAssistant} from '../../contexts/AIAssistantContext';
import {Send} from 'lucide-react';

const AIAssistantInput: React.FC = () => {
  const [input, setInput] = useState('');
  const {setMessage} = useAIAssistant();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      // In a real app, this would send the input to an AI service
      // For now, we'll just echo the input
      setMessage(`You asked: ${input}`);
      setInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={!input.trim()}
        >
          <Send size={18} />
        </button>
      </div>
    </form>
  );
};

export default AIAssistantInput;