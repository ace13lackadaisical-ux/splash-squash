const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radioAPI', {
  unlockVault: (pwd) => ipcRenderer.invoke('unlock-vault', pwd),
  lockVault: () => ipcRenderer.invoke('lock-vault'),
  getVaultStatus: () => ipcRenderer.invoke('get-vault-status'),
  getData: (key) => ipcRenderer.invoke('get-data', key),
  setData: (key, value) => ipcRenderer.invoke('set-data', key, value),
  onRequestUnlock: (cb) => ipcRenderer.on('request-unlock', () => cb()),
  onVaultLocked: (cb) => ipcRenderer.on('vault-locked', () => cb()),
  onSystemResume: (cb) => ipcRenderer.on('system-resume', () => cb())
});
