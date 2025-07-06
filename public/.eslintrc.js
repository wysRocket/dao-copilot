module.exports = {
  env: {
    browser: false,
    node: false,
    worker: true,
    serviceworker: true,
    webextensions: false
  },
  globals: {
    // Audio Worklet globals
    AudioWorkletProcessor: 'readonly',
    registerProcessor: 'readonly',
    currentTime: 'readonly',
    currentFrame: 'readonly',
    sampleRate: 'readonly',
    console: 'readonly'
  },
  rules: {
    'no-console': 'off',
    'no-undef': 'off'
  }
}
