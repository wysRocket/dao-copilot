import {GoogleGenAI} from '@google/genai';

// User-specified model name
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';

/**
 * Configuration options for the transcription service using Google Gemini
 */
export interface TranscriptionOptions {
  apiKey?: string; // Your Google API Key for Gemini
  modelName?: string; // Optional: override the default Gemini model name
}

/**
 * Transcription result interface
 */
export interface TranscriptionResult {
  text: string;
  duration: number; // Duration of the API call in milliseconds
  // Confidence is not directly provided by Gemini in a simple score format.
  [key: string]: unknown;
}

// Helper function to convert Buffer to a GenerativePart
function bufferToGenerativePart(buffer: Buffer, mimeType: string) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };
}

/**
 * Transcribes audio data using Google's Gemini API
 * This version is designed for the main process in Electron
 * @param audioData The audio data as a Buffer (e.g., from a WAV file)
 * @param options Configuration options including the API key and optional model name
 * @returns Promise resolving to the transcription result
 */
export async function transcribeAudio(
  audioData: Buffer,
  options: TranscriptionOptions = {},
): Promise<TranscriptionResult> {
  const startTime = Date.now();

  // In the main process, we can access environment variables directly
  // Try multiple possible environment variable names
  const apiKey =
    options.apiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error(
      'Transcription failed: Google API Key is required.',
      'Please set one of these environment variables:',
      '- GOOGLE_API_KEY',
      '- VITE_GOOGLE_API_KEY',
      '- GOOGLE_GENERATIVE_AI_API_KEY',
      '- GEMINI_API_KEY',
    );
    throw new Error(
      'Google API Key is required for transcription. Please check your environment variables.',
    );
  }

  console.log(
    'Using API key from environment (first 8 chars):',
    apiKey.substring(0, 8) + '...',
  );

  const genAI = new GoogleGenAI(apiKey as string);
  const modelName = options.modelName || DEFAULT_GEMINI_MODEL;

  console.log(`Initializing transcription with Gemini model: ${modelName}`);

  // Assuming audioData is a WAV file buffer.
  // Ensure the mimeType matches your audio format.
  const audioFilePart = bufferToGenerativePart(audioData, 'audio/wav');

  // Construct the prompt for transcription.
  const promptParts = [
    audioFilePart,
    {text: 'Please transcribe the provided audio.'},
  ];

  try {
    console.log(
      `Sending transcription request to Gemini at: ${new Date(startTime).toISOString()}`,
      `Audio buffer size: ${audioData.length} bytes`,
      `Model: ${modelName}`,
    );

    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [{role: 'user', parts: promptParts}],
    });

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`Transcription request completed in ${duration} ms`);

    const transcribedText = response.text;

    if (typeof transcribedText !== 'string') {
      console.error(
        'Transcription failed: .text property did not return a string.',
        JSON.stringify(response, null, 2),
      );
      throw new Error(
        'Failed to transcribe audio: Unexpected issue with extracting text from Gemini response.',
      );
    }

    if (transcribedText.trim() === '') {
      console.warn(
        'Transcription resulted in empty text. This might be due to silence, unintelligible audio, or content filtering.',
        JSON.stringify(response, null, 2),
      );
    }

    return {
      text: transcribedText.trim(),
      duration,
      // You can add other details from 'response' if needed
    };
  } catch (error: unknown) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(
      `Transcription failed after ${duration} ms with model ${modelName}:`,
    );

    // Enhanced error logging for different types of errors
    if (error && typeof error === 'object') {
      const errorObj = error as {
        response?: {status?: number};
        message?: string;
      };

      if (errorObj.response?.status) {
        console.error(`HTTP Status: ${errorObj.response.status}`);
        if (errorObj.response.status === 403) {
          console.error('API Key may be invalid or quota exceeded');
        } else if (errorObj.response.status === 400) {
          console.error('Bad request - check audio format or API parameters');
        }
      }

      if (errorObj.message?.includes('CORS')) {
        console.error(
          'CORS error detected - this should not happen in main process!',
        );
        console.error('If you see this, there might be a configuration issue.');
      }
    }

    // Log the error object itself for more details
    console.error('Full error details:', error);

    // More specific error logging if available
    if (error && typeof error === 'object') {
      const errorObj = error as {response?: {data?: unknown}; message?: string};

      if (errorObj.response && errorObj.response.data) {
        console.error(
          'Gemini API Error details:',
          JSON.stringify(errorObj.response.data, null, 2),
        );
      } else if (errorObj.message) {
        console.error('Error message:', errorObj.message);
      }
    }
    throw error; // Re-throw the error to be handled by the caller
  }
}
