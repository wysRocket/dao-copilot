import {ipcMain, session, desktopCapturer} from 'electron';
import {promises as fs} from 'fs';
import {
  AUDIO_WRITE_FILE_CHANNEL,
  AUDIO_READ_FILE_CHANNEL,
  AUDIO_REQUEST_PERMISSIONS_CHANNEL,
} from './audio-channels';

export function addAudioEventListeners() {
  // File operation handlers following electron-audio-capture-with-stt pattern
  ipcMain.handle(
    AUDIO_WRITE_FILE_CHANNEL,
    (_event, path: string, data: Uint8Array): Promise<void> => {
      console.log('Writing audio file to ' + path);
      return fs.writeFile(path, data);
    },
  );

  ipcMain.handle(
    AUDIO_READ_FILE_CHANNEL,
    (_event, path: string): Promise<Buffer> => {
      console.log('Reading audio file from ' + path);
      return fs.readFile(path);
    },
  );

  ipcMain.handle(AUDIO_REQUEST_PERMISSIONS_CHANNEL, (): Promise<boolean> => {
    // Audio permissions are typically handled at the renderer level
    // This is a placeholder for future permission management
    return Promise.resolve(true);
  });

  // Set up display media request handler for system audio capture
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({types: ['window', 'screen']})
      .then((sources) => {
        // Grant access to the first screen found with audio loopback
        callback({video: sources[0], audio: 'loopback'});
      });
  });
}
