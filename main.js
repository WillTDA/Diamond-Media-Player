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

  let gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }

      // Extract and handle the file path if provided in command line arguments
      const filePath = commandLine.find(arg => /\.(mp3|wav|ogg|mp4|webm|mkv|ogv)$/.test(arg));
      if (filePath) {
        handleFileOpen(filePath);
      }
    });
  }

  function handleFileOpen(filePath) {
    if (win) {
      win.webContents.send('selected-file', filePath);
    }
  }

  function handleOpenDialog() {
    dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }, { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'ogv'] }],
      defaultPath: store.get('lastOpenedDirectory', app.getPath('music')),
    }).then(result => {
      console.log(result);
      if (!result.canceled) {
        store.set('lastOpenedDirectory', path.dirname(result.filePaths[0]));
        handleFileOpen(result.filePaths[0]);
      }
    }).catch(err => {
      console.log(err);
    });
  }

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
      handleFileOpen(filePath);
    }
  });

  // Handle command-line arguments for other platforms
  if (process.argv.length >= 2) {
    const filePath = process.argv[1];
    if (win) {
      handleFileOpen(filePath);
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
          click: handleOpenDialog
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

  ipcMain.on('open-file-dialog', handleOpenDialog);

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