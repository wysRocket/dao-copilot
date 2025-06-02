import {exposeThemeContext} from './theme/theme-context';
import {exposeWindowContext} from './window/window-context';
import {exposeAudioContext} from './audio/audio-context';

export default function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
  exposeAudioContext();
}
