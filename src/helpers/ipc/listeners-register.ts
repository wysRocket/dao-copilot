import {addThemeEventListeners} from './theme/theme-listeners'
import {addWindowEventListeners} from './window/window-listeners'
import {addAudioEventListeners} from './audio/audio-listeners'
import {addTranscriptionEventListeners} from './transcription/transcription-listeners'
import {registerMCPListeners} from './mcp/mcp-listeners'
// import {addSearchEventListeners} from './search/search-listeners'; // Disabled: Using built-in Gemini search grounding

let listenersRegistered = false

export default function registerListeners() {
  // Only register listeners once globally
  if (listenersRegistered) {
    return
  }

  addWindowEventListeners()
  addThemeEventListeners()
  addAudioEventListeners()
  addTranscriptionEventListeners()
  registerMCPListeners()
  // addSearchEventListeners(); // Disabled: Using built-in Gemini search grounding

  listenersRegistered = true
}
