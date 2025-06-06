import React, {useState} from 'react';
import ReactDOM from 'react-dom/client';
import CustomTitleBar from './components/CustomTitleBar';
import {TranscriptionResult} from './services/main-stt-transcription';
import './styles/global.css';

const TitleBarApp: React.FC = () => {
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);

  const handleAskAI = () => {
    // Send IPC message to main window to show AI assistant
    if (window.electronWindow) {
      // This would send a message to the main window to show AI
      console.log('Ask AI clicked from title bar');
    }
  };

  const handleToggleVisibility = () => {
    // Send IPC message to main window to toggle AI visibility
    if (window.electronWindow) {
      console.log('Toggle AI visibility from title bar');
    }
  };

  const handleTranscription = (transcript: TranscriptionResult) => {
    // Add transcript to local state and send to transcript window
    const updatedTranscripts = [...transcripts, transcript];
    setTranscripts(updatedTranscripts);

    if (window.electronWindow) {
      console.log('Transcription received in title bar:', transcript);
      // Show transcript window and update it with new data
      window.electronWindow.showTranscriptWindow();
      window.electronWindow.updateTranscriptWindow(updatedTranscripts, false);
    }
  };

  const handleProcessingChange = (isProcessing: boolean) => {
    // Send processing state to transcript window
    if (window.electronWindow) {
      console.log('Processing state changed:', isProcessing);
      if (isProcessing) {
        window.electronWindow.showTranscriptWindow();
      }
      // Update transcript window with processing state
      window.electronWindow.updateTranscriptWindow(transcripts, isProcessing);
    }
  };

  return (
    <div className="h-full w-full">
      <CustomTitleBar
        onAskAI={handleAskAI}
        onToggleVisibility={handleToggleVisibility}
        isAIVisible={false}
        onTranscription={handleTranscription}
        onProcessingChange={handleProcessingChange}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById('titlebar-root') as HTMLElement,
);

root.render(<TitleBarApp />);
