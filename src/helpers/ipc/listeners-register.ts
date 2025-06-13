import {addThemeEventListeners} from './theme/theme-listeners';
import {addWindowEventListeners} from './window/window-listeners';
import {addAudioEventListeners} from './audio/audio-listeners';
import {addTranscriptionEventListeners} from './transcription/transcription-listeners';

let listenersRegistered = false;

export default function registerListeners() {
  // Only register listeners once globally
  if (listenersRegistered) {
    return;
  }

  addWindowEventListeners();
  addThemeEventListeners();
  addAudioEventListeners();
  addTranscriptionEventListeners();

  listenersRegistered = true;
}
