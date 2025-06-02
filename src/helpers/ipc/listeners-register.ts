import {BrowserWindow} from 'electron';
import {addThemeEventListeners} from './theme/theme-listeners';
import {addWindowEventListeners} from './window/window-listeners';
import {addAudioEventListeners} from './audio/audio-listeners';
import {addTranscriptionEventListeners} from './transcription/transcription-listeners';

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addThemeEventListeners();
  addAudioEventListeners();
  addTranscriptionEventListeners();
}
