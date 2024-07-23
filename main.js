const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1080,
    minHeight: 720,
    fullscreenable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets', 'diamondmediaplayer.ico')
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  //win.webContents.openDevTools();

  // Send saved preferences to renderer process
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('load-preferences', store.store);
  });

  // Handle the 'open-file' event
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (win) {
      win.webContents.send('selected-file', filePath);
    }
  });

  // Handle command-line arguments for other platforms
  if (process.argv.length >= 2) {
    const filePath = process.argv[1];
    if (win) {
      win.webContents.send('selected-file', filePath);
    }
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  const menuTemplate = [
    {
      label: 'Menu',
      submenu: [
        {
          label: 'Open File',
          accelerator: process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O',
          click: () => {
            dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }, { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'ogv'] }]
            }).then(result => {
              console.log(result);
              if (!result.canceled) {
                win.webContents.send('selected-file', result.filePaths[0]);
              }
            }).catch(err => {
              console.log(err);
            });
          }
        },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => {
            win.setFullScreen(!win.isFullScreen());
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          role: 'quit'
        }
      ]
    },
    {
      label: 'Preferences',
      click: () => {
        createPreferencesWindow();
      }
    },
    {
      label: 'Credits',
      click: () => {
        createCreditsWindow();
      }
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  function createPreferencesWindow() {
    const preferencesWindow = new BrowserWindow({
      width: 400,
      height: 300,
      parent: win,
      modal: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    preferencesWindow.setMenu(null);
    preferencesWindow.loadFile('src/preferences.html');
  }

  function createCreditsWindow() {
    const creditsWindow = new BrowserWindow({
      width: 750,
      height: 450,
      parent: win,
      modal: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    creditsWindow.setMenu(null);
    creditsWindow.loadFile('src/credits.html');
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  ipcMain.on('open-file-dialog', (event) => {
    dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }, { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'ogv'] }]
    }).then(result => {
      if (!result.canceled) {
        event.reply('selected-file', result.filePaths[0]);
      }
    }).catch(err => {
      console.log(err);
    });
  });

  ipcMain.on('save-preferences', (event, preferences, reload = true) => {
    if (preferences.visualiserFftSize) { store.set('visualiserFftSize', preferences.visualiserFftSize); }

    if (preferences.volume) { store.set('volume', preferences.volume); }

    // Reload all preferences if requested
    if (reload) win.webContents.send('load-preferences', store.store);

  });

  ipcMain.on('request-preferences', (event) => {
    event.reply('current-preferences', store.store);
  });
}

app.whenReady().then(createWindow);