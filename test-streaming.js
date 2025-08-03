window.testStreamingTranscription = () => { 
  console.log("🧪 Testing streaming transcription");
  window.electronWindow.broadcast("streaming-transcription", {
    text: "This is a test streaming transcription message",
    isFinal: false,
    source: "websocket-streaming",
    confidence: 0.9
  });
  setTimeout(() => {
    window.electronWindow.broadcast("streaming-transcription", {
      text: "This is a test streaming transcription message - now final",
      isFinal: true,
      source: "websocket-streaming-final", 
      confidence: 0.95
    });
  }, 2000);
}
