// Simple test to verify the import resolution
import {transcribeAudio} from '../../../services/main-stt-transcription';
import {transcribeAudioViaProxy} from '../../../services/proxy-stt-transcription';

console.log('Imports resolved successfully!');
console.log('transcribeAudio function:', typeof transcribeAudio);
console.log(
  'transcribeAudioViaProxy function:',
  typeof transcribeAudioViaProxy,
);
