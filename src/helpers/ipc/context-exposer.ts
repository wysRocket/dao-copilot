import {exposeThemeContext} from './theme/theme-context';
import {exposeWindowContext} from './window/window-context';
import {exposeAudioContext} from './audio/audio-context';
import {exposeTranscriptionContext} from './transcription/transcription-context';
import {exposeWindowManagerContext} from './window-manager/window-manager-context';

export default function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
  exposeAudioContext();
  exposeTranscriptionContext();
  exposeWindowManagerContext();
}
