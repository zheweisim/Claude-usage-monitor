const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getLimits: () => ipcRenderer.invoke('get-limits'),
  getOpacity: () => ipcRenderer.invoke('get-opacity'),
  saveOpacity: (val) => ipcRenderer.invoke('save-opacity', val),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  saveTheme: (theme) => ipcRenderer.invoke('save-theme', theme),
  onRefresh: (callback) => ipcRenderer.on('refresh', callback),
});
