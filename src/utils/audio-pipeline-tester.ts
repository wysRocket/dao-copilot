import {createAudioStream} from '../services/audio-capture';
import {renderWavFile} from '../utils/wav-processor';
import {sttService} from '../services/stt-service';
import {take, toArray} from 'rxjs';

/**
 * Test script for validating the audio recording pipeline
 * This can be used to test the audio capture, WAV generation, and STT processing
 */
export class AudioPipelineTester {
  /**
   * Test audio stream creation and basic functionality
   */
  static async testAudioStreamCreation(): Promise<boolean> {
    try {
      console.log('Testing audio stream creation...');

      // Test if audio stream can be created
      const stream = createAudioStream();

      // Take a few samples to verify the stream works
      const samples = await stream.pipe(take(5), toArray()).toPromise();

      console.log(
        `✅ Audio stream test passed. Received ${samples?.length || 0} audio chunks`,
      );
      return true;
    } catch (error) {
      console.error('❌ Audio stream test failed:', error);
      return false;
    }
  }

  /**
   * Test WAV file rendering with sample data
   */
  static testWavFileRendering(): boolean {
    try {
      console.log('Testing WAV file rendering...');

      // Create sample audio data (1 second of sine wave at 440Hz)
      const sampleRate = 44100;
      const duration = 1; // 1 second
      const frequency = 440; // A4 note
      const samples = new Float32Array(sampleRate * duration);

      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
      }

      // Test WAV rendering
      const wavData = renderWavFile(samples, {
        isFloat: false,
        numChannels: 1,
        sampleRate: sampleRate,
      });

      console.log(
        `✅ WAV rendering test passed. Generated ${wavData.length} bytes`,
      );
      return true;
    } catch (error) {
      console.error('❌ WAV rendering test failed:', error);
      return false;
    }
  }

  /**
   * Test STT service mock functionality
   */
  static async testSTTService(): Promise<boolean> {
    try {
      console.log('Testing STT service...');

      const testFilename = 'test-audio.wav';

      // Test mock transcription
      const result = await sttService.transcribeFile(testFilename).toPromise();

      if (result && result.text) {
        console.log(
          `✅ STT service test passed. Transcription: "${result.text}"`,
        );
        return true;
      } else {
        console.error('❌ STT service test failed: No transcription result');
        return false;
      }
    } catch (error) {
      console.error('❌ STT service test failed:', error);
      return false;
    }
  }

  /**
   * Run all tests
   */
  static async runAllTests(): Promise<void> {
    console.log('🚀 Starting Audio Pipeline Tests...\n');

    const results = {
      audioStream: await this.testAudioStreamCreation(),
      wavRendering: this.testWavFileRendering(),
      sttService: await this.testSTTService(),
    };

    console.log('\n📊 Test Results Summary:');
    console.log(`Audio Stream: ${results.audioStream ? '✅ PASS' : '❌ FAIL'}`);
    console.log(
      `WAV Rendering: ${results.wavRendering ? '✅ PASS' : '❌ FAIL'}`,
    );
    console.log(`STT Service: ${results.sttService ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = Object.values(results).every((result) => result);
    console.log(
      `\n${allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed'}`,
    );
  }
}

// Add to window for easy testing in browser console
if (typeof window !== 'undefined') {
  (
    window as unknown as {AudioPipelineTester: typeof AudioPipelineTester}
  ).AudioPipelineTester = AudioPipelineTester;
}
