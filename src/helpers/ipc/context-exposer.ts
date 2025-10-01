import {exposeThemeContext} from './theme/theme-context'
import {exposeWindowContext} from './window/window-context'
import {exposeAudioContext} from './audio/audio-context'
import {exposeTranscriptionContext} from './transcription/transcription-context'
// import {exposeSearchContext} from './search/search-context'; // Disabled: Using built-in Gemini search grounding

export default function exposeContexts() {
  exposeWindowContext()
  exposeThemeContext()
  exposeAudioContext()
  exposeTranscriptionContext()
  // exposeSearchContext(); // Disabled: Using built-in Gemini search grounding
}
