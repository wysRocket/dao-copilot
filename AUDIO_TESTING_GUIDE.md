# Audio Recording Test Guide

## Quick Test Checklist

### Prerequisites

1. **Microphone Permissions**: Ensure your browser/Electron app has microphone access
2. **Audio Input**: Connect a microphone or use built-in microphone
3. **Audio Output**: Have speakers/headphones ready to verify playback

### Testing the Audio Pipeline

#### 1. Start the Application

```bash
npm start
```

#### 2. Test Recording Controls

1. Click the **"Start Recording"** button
2. Speak into your microphone for 5-10 seconds
3. Click the **"Stop Recording"** button
4. Verify status messages appear correctly

#### 3. Verify File Output

1. Check that a WAV file is created (filename shown in status)
2. File should be saved in the project directory
3. File size should be reasonable (not 0 bytes)

#### 4. Test Transcription

1. After recording, wait for "Transcribing audio..." message
2. Mock transcription should appear in the transcript display
3. Verify confidence score is shown

#### 5. Browser Console Testing

Open DevTools Console and run:

```javascript
// Test individual components
AudioPipelineTester.runAllTests();

// Test specific parts
await AudioPipelineTester.testAudioStreamCreation();
AudioPipelineTester.testWavFileRendering();
await AudioPipelineTester.testSTTService();
```

### Expected Behavior

#### ✅ Success Indicators

- Recording button changes from "Start" to "Stop" when active
- Status updates show progress: "Recording..." → "Processing..." → "Saving..." → "Transcribing..." → "Complete"
- WAV file appears in project directory with timestamp filename
- Mock transcription appears in transcript display
- No error messages in console

#### ❌ Common Issues & Solutions

**No audio captured:**

- Check microphone permissions in browser/system settings
- Verify microphone is not muted
- Try refreshing the app and granting permissions again

**File not saved:**

- Check file system permissions
- Verify disk space available
- Look for error messages in console

**No transcription:**

- Expected for now (using mock service)
- Check console for STT service errors

**App won't start:**

- Run `npm install` to ensure dependencies
- Check terminal for build errors
- Verify Node.js version compatibility

### Manual Testing Steps

1. **Basic Recording Test**

   - Record 5 seconds of speech
   - Verify file creation and size
   - Check audio quality by playing file externally

2. **UI Responsiveness Test**

   - Start/stop recording multiple times
   - Verify button states update correctly
   - Check status messages are accurate

3. **Error Handling Test**

   - Try recording without microphone permission
   - Test with no audio input device
   - Verify graceful error handling

4. **Integration Test**
   - Record → Save → Transcribe end-to-end
   - Verify all components work together
   - Check memory usage doesn't grow excessively

### Performance Benchmarks

**Expected Performance:**

- Recording start: < 1 second delay
- File processing: < 2 seconds for 30-second recording
- File size: ~1.4MB per minute (44.1kHz, 16-bit, mono)
- Memory usage: < 100MB increase during recording

### Next Steps After Testing

Once basic recording works:

1. Integrate real STT service (OpenAI/AWS)
2. Add audio playback controls
3. Implement session management
4. Add export functionality
5. Enhance error handling

### Troubleshooting

**Check these if issues occur:**

1. Browser console for JavaScript errors
2. Network tab for failed requests
3. Application logs in terminal
4. System audio settings and permissions
5. Available disk space and write permissions
