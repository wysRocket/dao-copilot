import React, {useState, useEffect} from 'react';
import ReactDOM from 'react-dom/client';
import TranscriptDisplay from './components/TranscriptDisplay';
import {TranscriptionResult} from './services/main-stt-transcription';
import './styles/global.css';

interface TranscriptData {
  transcripts: TranscriptionResult[];
  isProcessing: boolean;
}

const TranscriptApp: React.FC = () => {
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Listen for transcript data from main process
    const handleTranscriptData = (_event: unknown, data: TranscriptData) => {
      setTranscripts(data.transcripts);
      setIsProcessing(data.isProcessing);
    };

    // Add IPC listener for transcript data
    if (window.electron && window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('transcript-data', handleTranscriptData);
    }

    return () => {
      if (window.electron && window.electron.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners('transcript-data');
      }
    };
  }, []);

  return (
    <div className="h-full w-full p-4">
      <TranscriptDisplay
        transcripts={transcripts}
        isProcessing={isProcessing}
      />
    </div>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById('transcript-root') as HTMLElement,
);

root.render(<TranscriptApp />);
