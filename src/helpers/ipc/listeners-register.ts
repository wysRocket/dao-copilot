import {BrowserWindow} from 'electron';
import {addThemeEventListeners} from './theme/theme-listeners';
import {
  addWindowEventListeners,
  addMultiWindowEventListeners,
} from './window/window-listeners';
import {addAudioEventListeners} from './audio/audio-listeners';
import {addTranscriptionEventListeners} from './transcription/transcription-listeners';
import {addAIEventListeners} from './ai/ai-listeners';

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addMultiWindowEventListeners();
  addThemeEventListeners();
  addAudioEventListeners();
  addTranscriptionEventListeners();
  addAIEventListeners();
}
