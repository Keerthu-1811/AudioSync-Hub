const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendCommand: (command) => ipcRenderer.invoke('engine-command', command),
  onEngineMessage: (callback) => {
    // Remove previous listeners to prevent duplicates
    ipcRenderer.removeAllListeners('engine-message');
    ipcRenderer.on('engine-message', (event, msg) => callback(msg));
  }
});
