window.resetCircuitBreaker = () => { 
  console.log("🔄 Resetting circuit breaker");
  if (window.electron?.ipcRenderer?.send) {
    window.electron.ipcRenderer.send("reset-circuit-breaker");
    console.log("✅ Circuit breaker reset signal sent");
  } else {
    console.warn("⚠️ Could not send reset signal - no IPC available");
  }
}
