import React, {useState, useEffect} from 'react';
import ToggleTheme from '@/components/ToggleTheme';
import {useTranslation} from 'react-i18next';
import LangToggle from '@/components/LangToggle';
import RecordingControls from '@/components/RecordingControls';
import TranscriptDisplay from '@/components/TranscriptDisplay';
import {TranscriptionResult} from '@/services/stt-service';
import {AudioPipelineTester} from '@/utils/audio-pipeline-tester';

import InitialIcons from '@/components/template/InitialIcons';

export default function HomePage() {
  const {t} = useTranslation();
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Make tester available in console for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (
        window as unknown as {AudioPipelineTester: typeof AudioPipelineTester}
      ).AudioPipelineTester = AudioPipelineTester;
      console.log(
        '🔧 AudioPipelineTester available in console. Run: AudioPipelineTester.runAllTests()',
      );
    }
  }, []);

  const handleTranscription = (transcript: TranscriptionResult) => {
    setTranscripts((prev) => [...prev, transcript]);
    setIsProcessing(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <InitialIcons />
        <span>
          <h1 className="font-mono text-4xl font-bold">{t('appName')}</h1>
          <p
            className="text-muted-foreground text-end text-sm uppercase"
            data-testid="pageTitle"
          >
            {t('titleHomePage')}
          </p>
        </span>
        <div className="mt-8 w-full max-w-md">
          <RecordingControls onTranscription={handleTranscription} />
        </div>
        <TranscriptDisplay
          transcripts={transcripts}
          isProcessing={isProcessing}
        />

        {/* Development Testing Button */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4">
            <button
              onClick={() => AudioPipelineTester.runAllTests()}
              className="rounded bg-blue-100 px-4 py-2 text-xs text-blue-800 hover:bg-blue-200"
            >
              🧪 Run Audio Tests
            </button>
          </div>
        )}

        <LangToggle />
        <ToggleTheme />
      </div>
    </div>
  );
}
