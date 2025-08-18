import {Observable} from 'rxjs'

/**
 * Options for starting a recording session allowing callers
 * (system-audio-capture service) to tune relative volumes.
 */
interface StartRecordingOptions {
  desktopGain?: number // 0..1 linear gain for system/desktop audio
  micGain?: number // 0..1 linear gain for microphone audio
}

export class Capturer {
  private recording_stream?: MediaStream
  private audio_context?: AudioContext

  private async mic(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })
  }

  private async audio(): Promise<MediaStream> {
    return navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: {
        width: 320,
        height: 240,
        frameRate: 30
      }
    })
  }

  /**
   * Merge system(display) + mic streams with independent gain controls
   * and expose lightweight RMS metering for runtime verification.
   */
  mergeAudioStreams(
    audio_context: AudioContext,
    desktopStream: MediaStream,
    voiceStream: MediaStream,
    opts?: StartRecordingOptions
  ): {tracks: MediaStreamTrack[]; stopMeters: () => void} {
    const desktopSource = audio_context.createMediaStreamSource(desktopStream)
    const micSource = audio_context.createMediaStreamSource(voiceStream)
    const destination = audio_context.createMediaStreamDestination()

    // Individual gains (default 0.8 to match prior config expectation)
    const desktopGain = audio_context.createGain()
    desktopGain.gain.value = opts?.desktopGain ?? 0.8
    const micGain = audio_context.createGain()
    micGain.gain.value = opts?.micGain ?? 0.8

    desktopSource.connect(desktopGain).connect(destination)
    micSource.connect(micGain).connect(destination)

    // Meters
    const desktopAnalyser = audio_context.createAnalyser()
    const micAnalyser = audio_context.createAnalyser()
    const mixAnalyser = audio_context.createAnalyser()
    desktopAnalyser.fftSize = 2048
    micAnalyser.fftSize = 2048
    mixAnalyser.fftSize = 2048

    desktopSource.connect(desktopAnalyser)
    micSource.connect(micAnalyser)
    // Ensure at least one track exists (defensive check)
    if (destination.stream.getAudioTracks().length === 0) {
      console.warn('[AudioCapture] Destination stream has no audio tracks after merge.')
    }
    const mixSource = audio_context.createMediaStreamSource(destination.stream)
    mixSource.connect(mixAnalyser)

    const desktopBuffer = new Float32Array(desktopAnalyser.fftSize)
    const micBuffer = new Float32Array(micAnalyser.fftSize)
    const mixBuffer = new Float32Array(mixAnalyser.fftSize)

    function rms(buf: Float32Array): number {
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i]
        sum += v * v
      }
      return Math.sqrt(sum / buf.length)
    }

    let meterTimer: number | undefined
    // Attach lightweight debug object on window for runtime verification
    interface MixDebug {
      micRMS?: number
      desktopRMS?: number
      mixRMS?: number
      lastMeterAt?: number
      metering?: boolean
      desktopGain?: number
      micGain?: number
    }
    const w = window as unknown as {__AUDIO_MIX_DEBUG?: MixDebug}
    if (!w.__AUDIO_MIX_DEBUG) {
      w.__AUDIO_MIX_DEBUG = {}
    }
    const debugRef = w.__AUDIO_MIX_DEBUG

    const updateMeters = () => {
      try {
        desktopAnalyser.getFloatTimeDomainData(desktopBuffer)
        micAnalyser.getFloatTimeDomainData(micBuffer)
        mixAnalyser.getFloatTimeDomainData(mixBuffer)
        debugRef.micRMS = rms(micBuffer)
        debugRef.desktopRMS = rms(desktopBuffer)
        debugRef.mixRMS = rms(mixBuffer)
        debugRef.lastMeterAt = Date.now()
      } catch {
        // ignore
      }
      meterTimer = window.setTimeout(updateMeters, 1000)
    }
    meterTimer = window.setTimeout(updateMeters, 1000)

    const stopMeters = () => {
      if (meterTimer) {
        clearTimeout(meterTimer)
        meterTimer = undefined
      }
    }

    debugRef.metering = true
    debugRef.desktopGain = desktopGain.gain.value
    debugRef.micGain = micGain.gain.value

    return {tracks: destination.stream.getAudioTracks(), stopMeters}
  }

  private sampleRate(stream: MediaStream): number | undefined {
    return stream.getAudioTracks()[0].getSettings().sampleRate
  }

  startRecording = async (
    cb: (buffer: number[]) => void,
    options?: StartRecordingOptions
  ): Promise<void> => {
    if (this.recording_stream) {
      return
    }

    this.audio_context = new AudioContext({sampleRate: 44100})
    const desktop = await this.audio()
    const mic = await this.mic()
    const merged = this.mergeAudioStreams(this.audio_context, desktop, mic, options)
    this.recording_stream = new MediaStream(merged.tracks)
    const audioSource = this.audio_context.createMediaStreamSource(this.recording_stream)

    await this.audio_context.audioWorklet.addModule(new URL('wave-loopback.js', import.meta.url))
    const waveLoopbackNode = new AudioWorkletNode(this.audio_context, 'wave-loopback')
    waveLoopbackNode.port.onmessage = (event): void => {
      const inputFrame = event.data
      cb(inputFrame)
    }

    audioSource.connect(waveLoopbackNode)
    waveLoopbackNode.connect(this.audio_context.destination)

    console.log('Recording started')
  }

  stopRecording = async (): Promise<void> => {
    if (!this.recording_stream) {
      return
    }

    this.recording_stream.getTracks().forEach(track => track.stop())
    this.recording_stream = undefined

    if (this.audio_context) {
      this.audio_context.close()
      this.audio_context = undefined
    }

    console.log('Recording stopped')
  }
}

export function audio_stream(): Observable<number[]> {
  const capturer = new Capturer()
  return new Observable<number[]>(subscriber => {
    capturer.startRecording(buffer => {
      subscriber.next(buffer)
    })

    return (): void => {
      capturer.stopRecording()
      subscriber.complete()
    }
  })
}
