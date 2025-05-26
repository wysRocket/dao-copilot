# DAO Copilot Development Plan - Updated Architecture

_Following electron-audio-capture-with-stt proven approach_

## Current Status Analysis (Updated May 25, 2025)

- ✅ Basic Electron + React + TypeScript setup complete
- ✅ Audio capture service implemented (system + microphone merge)
- ✅ AudioWorklet processor for real-time audio processing
- ✅ WAV file processing utilities created
- ✅ RxJS Observable audio stream architecture
- ✅ Preload script with file operation APIs implemented
- ✅ Complete Electron IPC infrastructure following reference architecture
- ✅ Recording UI components created and integrated
- ✅ Mock STT service with Observable pattern
- ✅ Transcript display component implemented
- ✅ Full application compiling and running successfully
- ⏳ Manual testing of audio pipeline needed
- ❌ Real STT integration pending

## Implementation Progress

### ✅ Phase 1: Electron Integration (COMPLETED)

1. **Preload Script Updates** ✅

   - Added file operation APIs (`writeFile`, `readFile`)
   - Exposed audio permission management
   - Added security-focused context bridge APIs

2. **Main Process Updates** ✅

   - Added IPC handlers for file operations
   - Implemented display media request handler for system audio
   - Added audio permission management

3. **Basic Recording UI** ✅
   - Created start/stop recording controls following reference
   - Integrated RxJS Observable audio streams
   - Implemented WAV file export functionality
   - Added to HomePage with proper integration

### ✅ IMMEDIATE ACCOMPLISHMENTS (May 25, 2025)

#### Core Implementation Complete:

- **Full Electron IPC Pipeline**: Audio channels, context bridge, and listeners implemented
- **Recording UI Components**: Start/stop controls with visual feedback and status display
- **Audio Processing**: RxJS-based audio streaming with WAV file export
- **Mock STT Integration**: Observable-based transcription service with multiple provider support
- **UI Integration**: Seamlessly integrated into existing TanStack Router architecture
- **Testing Infrastructure**: Added comprehensive testing utilities and guide
- **Development Tools**: Added console testing tools and development-only test buttons

#### Files Created/Modified:

- `src/helpers/ipc/audio/` - Complete audio IPC infrastructure
- `src/components/RecordingControls.tsx` - Recording UI with RxJS integration
- `src/components/TranscriptDisplay.tsx` - Real-time transcript display
- `src/services/stt-service.ts` - Extensible STT service with provider pattern
- `src/utils/audio-pipeline-tester.ts` - Comprehensive testing utilities
- `AUDIO_TESTING_GUIDE.md` - Complete testing documentation

#### Current Status:

🟢 **READY FOR TESTING** - Complete audio recording pipeline implemented and running

### 📋 IMMEDIATE NEXT STEPS (TESTING PHASE)

#### Manual Testing (Current Priority):

1. **Audio Permission Verification**

   - Test microphone access permissions
   - Verify system audio capture capability
   - Test permission denial handling

2. **Recording Pipeline Validation**

   - Verify audio capture → WAV generation → file saving
   - Test file output quality and size
   - Validate error handling for edge cases

3. **UI/UX Testing**
   - Verify start/stop button responsiveness
   - Test status message accuracy
   - Validate transcript display functionality

#### Post-Testing Development:

- Implement transcript export functionality

### Phase 3: Meeting Features (Week 3-4)

1. **Meeting Session Management**

   - Session recording with timestamps
   - Basic meeting notes
   - Speaker identification (if multiple participants)

2. **Document Integration**
   - Simple document upload for meeting context
   - Basic search functionality
   - Meeting notes correlation

## Security & Privacy First Approach

### Data Protection

- All user data encrypted at rest and in transit
- Client-side encryption for private notes
- Minimal data retention policies
- Clear audit trails for all actions

### User Control

- Granular permission controls
- Clear AI activity indicators
- One-click disable for all AI features
- Export functionality for user data

## Technical Architecture (Electron-Focused)

### Core Components (Updated Structure)

```
src/
├── main.ts                          # Main process (update needed)
├── preload.ts                       # Preload script (update needed)
├── renderer.ts                      # Renderer entry point (update needed)
├── App.tsx                         # Main React app (integrate recording)
├── components/
│   ├── ui/                         # Shadcn/ui components (keep existing)
│   ├── RecordingControls.tsx       # New: Simple start/stop buttons
│   ├── TranscriptDisplay.tsx       # New: Real-time transcript view
│   └── template/                   # Existing custom components
├── services/
│   ├── audio-capture.ts            # ✅ Implemented (system + mic merge)
│   ├── transcription.ts            # New: STT service integration
│   └── meeting-context.ts          # Meeting session management
├── utils/
│   └── wav-processor.ts            # ✅ Implemented (WAV format utilities)
├── worklets/
│   └── wave-loopback.js            # ✅ Implemented (AudioWorklet processor)
└── types/
    └── audio.d.ts                  # Audio-related type definitions
```

### Implementation Status

#### ✅ COMPLETED - Audio Capture Foundation

Based on electron-audio-capture-with-stt:

**1. Audio Capture Service (`src/services/audio-capture.ts`)**

```typescript
import {Observable} from 'rxjs';

export class AudioCapturer {
  private recording_stream?: MediaStream;
  private audio_context?: AudioContext;

  // Merges system audio + microphone using Web Audio API
  mergeAudioStreams(
    context: AudioContext,
    desktop: MediaStream,
    voice: MediaStream,
  );

  // Starts recording with real-time callback
  async startRecording(callback: (buffer: number[]) => void): Promise<void>;

  // Stops recording and cleans up resources
  async stopRecording(): Promise<void>;
}

// RxJS Observable wrapper for audio streams
export function audio_stream(): Observable<number[]>;
```

**2. WAV Processing (`src/utils/wav-processor.ts`)**

```typescript
type WavOptions = {
  isFloat: boolean;
  numChannels?: number;
  sampleRate?: number;
};

// Converts Float32Array to WAV file format with proper headers
export function renderWavFile(
  buffer: Float32Array,
  options: WavOptions,
): Uint8Array;
```

**3. AudioWorklet Processor (`src/worklets/wave-loopback.js`)**

```javascript
class WaveLoopback extends AudioWorkletProcessor {
  process(inputs, _outputs, _parameters) {
    // Collects audio samples in real-time
    // Posts data to main thread via MessagePort
  }
}
registerProcessor('wave-loopback', WaveLoopback);
```

#### ⏳ NEXT - Electron Integration (This Week)

**1. Update Preload Script**
Add to existing `src/preload.ts`:

```typescript
// Add file operation APIs following reference pattern
contextBridge.exposeInMainWorld('nodeAPI', {
  bufferAlloc: (size: number) => Buffer.alloc(size),
  writeFile: (path: string, data: Uint8Array) => {
    return electronAPI.ipcRenderer.invoke('writeFile', path, data);
  },
  readFile: (path: string) => {
    return electronAPI.ipcRenderer.invoke('readFile', path);
  },
  requestAudioPermissions: () => {
    return electronAPI.ipcRenderer.invoke('requestAudioPermissions');
  },
});
```

**2. Update Main Process**
Add to existing `src/main.ts`:

```typescript
import {promises as fs} from 'fs';

// File operation IPC handlers
ipcMain.handle('writeFile', (_event, path, data): Promise<void> => {
  console.log('writing file to ' + path);
  return fs.writeFile(path, data);
});

// Display media request handler for system audio
session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
  desktopCapturer.getSources({types: ['window', 'screen']}).then((sources) => {
    callback({video: sources[0], audio: 'loopback'});
  });
});
```

**3. Create Recording Component**
New file `src/components/RecordingControls.tsx`:

```typescript
import {audio_stream} from '../services/audio-capture';
import {renderWavFile} from '../utils/wav-processor';
import {buffer, firstValueFrom, fromEvent, map} from 'rxjs';

const RecordingControls = () => {
  const [isRecording, setIsRecording] = useState(false);

  const record_wav = async (stop_event: Observable<any>) => {
    const data = await firstValueFrom(
      audio_stream().pipe(
        buffer(stop_event),
        map((chunks) => chunks.reduce((acc, chunk) => acc.concat(chunk), [])),
        map((data) => new Float32Array(data)),
        map((data) =>
          renderWavFile(data, {
            isFloat: false,
            numChannels: 1,
            sampleRate: 44100,
          }),
        ),
      ),
    );

    console.log('Writing meeting recording...');
    await window.nodeAPI.writeFile('meeting-recording.wav', data);
  };
};
```

## Required Dependencies

### Add to package.json:

```bash
# Core audio streaming (following reference architecture)
npm install rxjs

# STT integration options (choose one initially)
npm install @aws-sdk/client-sagemaker-runtime @aws-sdk/credential-providers  # AWS approach
# OR
npm install openai  # OpenAI Whisper API

# File type detection
npm install file-type

# Future meeting features
npm install date-fns  # Date utilities for meeting sessions
```

### Reference Dependencies (from electron-audio-capture-with-stt):

```json
{
  "dependencies": {
    "rxjs": "^7.8.1",
    "@aws-sdk/client-sagemaker-runtime": "^3.758.0",
    "@aws-sdk/credential-providers": "^3.758.0"
  }
}
```

## Immediate Implementation Steps

### Step 1: Update Preload Script ⏳

```bash
# Edit src/preload.ts to add file operation APIs
```

### Step 2: Update Main Process ⏳

```bash
# Edit src/main.ts to add IPC handlers and display media handler
```

### Step 3: Create Recording UI ⏳

```bash
# Create src/components/RecordingControls.tsx
# Integrate with existing App.tsx
```

### Step 4: Test Audio Pipeline ⏳

```bash
# Test complete recording workflow:
# Start recording → Capture audio → Save WAV file → Verify output
```

### Step 5: Add STT Integration ⏳

```bash
# Create src/services/transcription.ts
# Implement file-based transcription workflow
```

## Key Differences from Original Plan

### ✅ Simplified Approach

- **No complex backend**: Direct Electron audio capture
- **File-based STT**: Save WAV files and process via API calls
- **RxJS streams**: Observable-based audio data flow
- **Proven patterns**: Following working implementation exactly

### ✅ Reference Architecture Benefits

- **Battle-tested**: Based on working electron-audio-capture-with-stt
- **Minimal complexity**: Simple start/stop recording workflow
- **Clear separation**: Audio capture → WAV export → STT processing
- **Reliable APIs**: Standard Electron audio permissions and file operations

## Privacy & Security Approach

### Core Principles

- **Local-first**: Audio processing and storage on user's machine
- **Minimal cloud**: Only STT API calls, no persistent cloud storage
- **User control**: Clear recording indicators and easy disable
- **Transparency**: Open source approach with clear data handling

### Data Flow Security

1. **Audio Capture**: Local system audio + microphone only
2. **Processing**: Local WAV file generation and temporary storage
3. **STT**: Send audio file to cloud API → receive transcript → delete audio
4. **Storage**: Store transcripts locally with user-controlled retention

## Success Metrics & Timeline

### Week 1 Success Criteria

- ✅ Audio capture service working (COMPLETED)
- ✅ WAV file processing functional (COMPLETED)
- ⏳ Basic recording UI with start/stop controls
- ⏳ File save/export working properly
- ⏳ System audio + microphone merge confirmed

### Week 2 Success Criteria

- ⏳ STT integration working with sample audio files
- ⏳ Transcript display showing results
- ⏳ Complete workflow: Record → Save → Transcribe → Display

### Week 3 Success Criteria

- ⏳ Meeting session management
- ⏳ Basic document context integration
- ⏳ Privacy controls and user consent flows

## Getting Started Today

### 1. Install Dependencies

```bash
cd /Users/wysmyfree/Projects/dao-copilot
npm install rxjs
```

### 2. Update Core Files

- [ ] Update `src/preload.ts` with file operation APIs
- [ ] Update `src/main.ts` with IPC handlers
- [ ] Create `src/components/RecordingControls.tsx`
- [ ] Integrate recording controls into `src/App.tsx`

### 3. Test Audio Pipeline

- [ ] Start recording → Capture system + mic audio
- [ ] Stop recording → Save WAV file to local storage
- [ ] Verify WAV file can be played back
- [ ] Confirm audio quality and format

### 4. STT Integration

- [ ] Choose STT provider (AWS SageMaker or OpenAI Whisper)
- [ ] Create `src/services/transcription.ts`
- [ ] Test transcription with saved WAV files
- [ ] Add transcript display component

---

_This updated plan follows the proven electron-audio-capture-with-stt architecture for maximum reliability and minimum complexity. The focus is on getting a working audio capture and transcription pipeline as quickly as possible._
