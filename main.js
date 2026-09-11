const { app, Tray, Menu, BrowserWindow, ipcMain, Notification, nativeImage, powerMonitor } = require('electron');
const Store = require('electron-store').default;
const path = require('path');

const store = new Store();
let tray = null;
let mainWindow = null;
let isVaultUnlocked = false;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 380,
    height: 540,
    show: true,
    frame: true,
    titleBarStyle: 'hiddenInset',
    title: 'Splash & Squash',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updateTrayTooltip(text) {
  if (tray) tray.setToolTip(`Splash & Squash - ${text}`);
}

function sendToWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

function showNotification(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

function lockVault() {
  isVaultUnlocked = false;
  sendToWindow('vault-locked', null);
  updateTrayTooltip('Vault Locked');
}

function createTray() {
  let icon;
  const iconPath = path.join(__dirname, 'icon.png');
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) throw new Error('Icon not found');
    icon = img;
  } catch(e) {
    // Fallback green circle
    const iconData = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZdEVYdFNvZnR3YXJlAHBhaW50Lm5ldCA0LjAuMTM0A1t6AAAAI0lEQVQ4T2P8//8/Ay0xEADjbxkYB2Dx/x8YGAhSQMUwABwBANt/VdXJAAAAAElFTkSuQmCC`;
    icon = nativeImage.createFromDataURL(iconData);
  }
  tray = new Tray(icon.resize({ width: 22, height: 22 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Unlock Vault', click: () => sendToWindow('request-unlock', null) },
    { label: 'Lock Vault', click: () => lockVault(), enabled: isVaultUnlocked },
    { type: 'separator' },
    { label: 'Show Radio', click: () => createWindow() },
    { type: 'separator' },
    { label: 'Start at Login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Splash & Squash');
  tray.on('click', () => createWindow());
}

app.whenReady().then(() => {
  createTray();
  createWindow();
  powerMonitor.on('resume', () => {
    sendToWindow('system-resume', null);
  });
});

app.on('window-all-closed', (e) => { if (!app.isQuitting) e.preventDefault(); });
app.on('before-quit', () => { app.isQuitting = true; });

// IPC handlers
ipcMain.handle('unlock-vault', (event, password) => {
  const savedHash = store.get('masterKey');
  const inputHash = Buffer.from(password).toString('base64');
  if (!savedHash) {
    store.set('masterKey', inputHash);
    isVaultUnlocked = true;
    updateTrayTooltip('Vault Unlocked');
    return { success: true, firstTime: true };
  } else if (savedHash === inputHash) {
    isVaultUnlocked = true;
    updateTrayTooltip('Vault Unlocked');
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('lock-vault', () => {
  lockVault();
  return { success: true };
});

ipcMain.handle('get-vault-status', () => ({ unlocked: isVaultUnlocked }));

ipcMain.handle('get-data', (event, key) => store.get(key));
ipcMain.handle('set-data', (event, key, value) => store.set(key, value));
