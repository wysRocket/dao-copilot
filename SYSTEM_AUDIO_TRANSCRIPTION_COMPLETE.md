# System Audio Transcription Implementation

## 🎯 Overview

We've successfully implemented comprehensive system audio transcription that can capture and transcribe:

- **🎤 Microphone audio** (traditional voice input)
- **🔊 System audio** (YouTube, Zoom, music, notifications, any app audio)
- **🎧 Mixed mode** (both microphone AND system audio simultaneously)

## 📁 Files Created

### 1. Core Service (`src/services/system-audio-capture.ts`)

**Purpose**: Main service for capturing audio from different sources
**Key Features**:

- Microphone capture using `getUserMedia()`
- System audio capture using `getDisplayMedia()` with audio
- Mixed mode combining both streams
- Permission management and error handling
- Audio stream merging and processing

### 2. React Hook (`src/hooks/useSystemAudioTranscription.tsx`)

**Purpose**: React hook for managing system audio transcription state
**Key Features**:

- State management for capture, transcription, and permissions
- Integration with IPC transcription API
- Error handling and status tracking
- Real-time transcription results processing

### 3. UI Component (`src/components/SystemAudioTranscriptionComponent.tsx`)

**Purpose**: Complete UI for system audio transcription
**Key Features**:

- Audio source selection (mic, system, mixed)
- Permission status indicators
- Real-time status display (capturing, transcribing)
- Help text and usage instructions
- Integration with AccumulativeTranscriptDisplay

### 4. Integration Test (`src/tests/system-audio-integration-test.ts`)

**Purpose**: Comprehensive testing of system audio functionality
**Key Features**:

- Permission testing
- Audio capture testing
- Transcription pipeline testing
- Error scenario testing

### 5. Updated TranscriptsPage (`src/pages/assistant/TranscriptsPage.tsx`)

**Purpose**: Main transcription interface with system audio support
**Key Features**:

- Mode switching between IPC and System Audio transcription
- UI toggle for different transcription modes
- Integrated help and status display

## 🚀 How It Works

### Audio Capture Flow:

1. **Permission Request**: Request microphone and/or screen sharing permissions
2. **Stream Acquisition**:
   - Microphone: `navigator.mediaDevices.getUserMedia({ audio: true })`
   - System Audio: `navigator.mediaDevices.getDisplayMedia({ audio: true })`
3. **Stream Processing**: Merge streams using Web Audio API if in mixed mode
4. **Audio Worklet**: Process audio data using existing `wave-loopback.js`
5. **Transcription**: Send audio data to IPC transcription API
6. **Display**: Show results in AccumulativeTranscriptDisplay

### Permission Management:

- **Automatic Detection**: Check existing permissions on component mount
- **Request Flow**: Guide users through granting required permissions
- **Status Indicators**: Visual feedback on permission status
- **Error Handling**: Graceful fallbacks and user-friendly error messages

### Integration Points:

- **IPC API**: Uses existing `window.transcriptionAPI.triggerTranscription()`
- **State Management**: Integrates with `useTranscriptStore`
- **UI Components**: Reuses `AccumulativeTranscriptDisplay`
- **Electron**: Works within existing Electron app architecture

## 🎯 Use Cases Supported

### 1. YouTube Video Transcription

- Select "System Audio" mode
- Grant screen sharing permission
- Play any YouTube video
- Get real-time transcription of video audio

### 2. Zoom/Teams Meeting Transcription

- Select "System Audio" or "Mixed" mode
- Capture meeting audio and/or your microphone
- Real-time meeting transcription

### 3. Music/Podcast Transcription

- Works with Spotify, Apple Music, podcasts
- Transcribe lyrics or spoken content from any audio app

### 4. System Notification Transcription

- Capture and transcribe system alerts, notifications
- Accessibility feature for hearing-impaired users

### 5. Mixed Mode Recording

- Simultaneously capture system audio AND microphone
- Perfect for content creation, interviews, tutorials

## 🔧 Technical Implementation Details

### Browser APIs Used:

- `navigator.mediaDevices.getUserMedia()` - Microphone access
- `navigator.mediaDevices.getDisplayMedia()` - System audio via screen sharing
- `Web Audio API` - Stream processing and merging
- `AudioWorklet` - Real-time audio processing

### Security Considerations:

- Requires user permission for both microphone and screen sharing
- Permissions are clearly explained to users
- Graceful degradation if permissions denied
- No persistent storage of audio data

### Performance Optimizations:

- Reuses existing audio worklet (`wave-loopback.js`)
- Efficient stream merging using Web Audio API
- Real-time processing without buffering delays
- Minimal UI re-renders with proper state management

## 📱 User Interface

### Permission Status Indicators:

- 🟢 Green: Permission granted and working
- 🔴 Red: Permission denied or unavailable
- Clear labels for microphone and system audio status

### Audio Source Selection:

- **🎤 Microphone**: Traditional voice transcription
- **🔊 System Audio**: Transcribe any app's audio output
- **🎧 Mixed Mode**: Both microphone and system audio

### Real-time Status:

- Capturing indicator with pulse animation
- Transcribing status with processing feedback
- Audio level visualization
- Error messages with helpful suggestions

### Help System:

- Expandable help section explaining each mode
- Permission requirements clearly stated
- Step-by-step usage instructions
- Troubleshooting guidance

## 🎉 Ready to Use!

The system audio transcription is now fully implemented and ready for testing. Users can:

1. **Refresh the assistant window** to load the new components
2. **Switch to "System Audio Transcription"** mode in TranscriptsPage
3. **Grant permissions** when prompted
4. **Start transcribing** audio from any application!

### Expected Results:

- ✅ Real-time transcription of YouTube videos
- ✅ Zoom/Teams meeting transcription
- ✅ Music and podcast transcription
- ✅ System notification transcription
- ✅ Mixed mode for simultaneous mic + system audio
- ✅ Integration with existing transcript storage and display
