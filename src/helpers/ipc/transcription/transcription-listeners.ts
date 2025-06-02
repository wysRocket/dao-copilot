import {ipcMain} from 'electron';
import {TRANSCRIPTION_TRANSCRIBE_CHANNEL} from './transcription-channels';
import {transcribeAudio} from '../../../services/main-stt-transcription';
import {transcribeAudioViaProxy} from '../../../services/proxy-stt-transcription';

export function addTranscriptionEventListeners() {
  ipcMain.handle(
    TRANSCRIPTION_TRANSCRIBE_CHANNEL,
    async (_event, audioData: Uint8Array) => {
      try {
        console.log(
          'Received transcription request in main process, audio data size:',
          audioData.length,
        );

        // Convert Uint8Array to Buffer for the transcription function
        const buffer = Buffer.from(audioData);

        try {
          // Try direct API call first
          const result = await transcribeAudio(buffer);
          console.log(
            'Direct transcription completed successfully:',
            result.text.substring(0, 50) + '...',
          );
          return result;
        } catch (directError: unknown) {
          const directErrorMessage =
            directError instanceof Error
              ? directError.message
              : 'Unknown error';
          console.warn(
            'Direct transcription failed, trying proxy fallback:',
            directErrorMessage,
          );

          // If direct call fails (e.g., due to CORS or network issues), try proxy
          try {
            const proxyResult = await transcribeAudioViaProxy(buffer);
            console.log(
              'Proxy transcription completed successfully:',
              proxyResult.text.substring(0, 50) + '...',
            );
            return proxyResult;
          } catch (proxyError: unknown) {
            const proxyErrorMessage =
              proxyError instanceof Error
                ? proxyError.message
                : 'Unknown error';
            console.error('Both direct and proxy transcription failed');
            console.error('Direct error:', directError);
            console.error('Proxy error:', proxyError);
            throw new Error(
              `Transcription failed with both methods: ${directErrorMessage} | ${proxyErrorMessage}`,
            );
          }
        }
      } catch (error) {
        console.error('Transcription error in main process:', error);
        throw error;
      }
    },
  );
}
