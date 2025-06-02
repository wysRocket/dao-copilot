import fetch from 'node-fetch';
import {getProxyAuthToken} from '../helpers/proxy-server';

/**
 * Configuration options for the proxy-based transcription service
 */
export interface ProxyTranscriptionOptions {
  apiKey?: string;
  modelName?: string;
  proxyUrl?: string;
}

/**
 * Transcription result interface
 */
export interface ProxyTranscriptionResult {
  text: string;
  duration: number;
  [key: string]: unknown;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';
const DEFAULT_PROXY_URL = 'http://localhost:8001';

/**
 * Alternative transcription service that uses the proxy server
 * This can be used as a fallback if direct API calls have issues
 */
export async function transcribeAudioViaProxy(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {},
): Promise<ProxyTranscriptionResult> {
  const startTime = Date.now();

  const apiKey =
    options.apiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Google API Key is required for proxy transcription.');
  }

  const modelName = options.modelName || DEFAULT_GEMINI_MODEL;
  const proxyUrl = options.proxyUrl || DEFAULT_PROXY_URL;

  // Prepare the request body for Gemini API
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: audioData.toString('base64'),
              mimeType: 'audio/wav',
            },
          },
          {
            text: 'Please transcribe the provided audio.',
          },
        ],
      },
    ],
  };

  try {
    console.log(
      `Sending transcription request via proxy: ${proxyUrl}/gemini/models/${modelName}:generateContent`,
    );

    const response = await fetch(
      `${proxyUrl}/gemini/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-proxy-auth': getProxyAuthToken(), // Add authentication token
        },
        body: JSON.stringify(requestBody),
      },
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Proxy transcription failed with status ${response.status}:`,
        errorText,
      );
      throw new Error(
        `Proxy transcription failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = await response.json();
    const transcribedText =
      result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!transcribedText) {
      console.warn(
        'No transcription text found in proxy response:',
        JSON.stringify(result, null, 2),
      );
    }

    console.log(`Proxy transcription completed in ${duration} ms`);

    return {
      text: transcribedText.trim(),
      duration,
      rawResponse: result,
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error(`Proxy transcription failed after ${duration} ms:`, error);
    throw error;
  }
}
