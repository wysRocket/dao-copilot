import exposeContexts from './helpers/ipc/context-exposer';
import {exposeAudioContext} from './helpers/ipc/audio/audio-context';
import {exposeTranscriptionContext} from './helpers/ipc/transcription/transcription-context';
import {exposeThemeContext} from './helpers/ipc/theme/theme-context';
import {exposeWindowContext} from './helpers/ipc/window/window-context';

console.log('Testing API exposures...');

// Test that the exposure doesn't throw errors
try {
  exposeContexts();
  console.log('✅ All contexts exposed successfully');
} catch (error) {
  console.error('❌ Error exposing contexts:', error);
}

// Test individual context exposures
try {
  console.log('Individual context functions loaded:', {
    exposeAudioContext: typeof exposeAudioContext,
    exposeTranscriptionContext: typeof exposeTranscriptionContext,
    exposeThemeContext: typeof exposeThemeContext,
    exposeWindowContext: typeof exposeWindowContext,
  });
  console.log('All context modules loaded successfully');
} catch (error) {
  console.error('Error loading context modules:', error);
}

export {};
