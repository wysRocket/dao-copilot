import { contextBridge, ipcRenderer } from "electron"

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  minimize: () => ipcRenderer.send("minimize-window"),
  maximize: () => ipcRenderer.send("maximize-window"),
  close: () => ipcRenderer.send("close-window"),
  isMaximized: () => ipcRenderer.invoke("is-maximized"),
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on("maximize-change", (_event, isMaximized) => callback(isMaximized))
    return () => {
      ipcRenderer.removeAllListeners("maximize-change")
    }
  },
})
