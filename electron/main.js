import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  }
}

function startPythonEngine() {
  let engineExecutable;
  
  if (app.isPackaged) {
    engineExecutable = path.join(process.resourcesPath, 'engine.exe');
    pythonProcess = spawn(engineExecutable, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    const enginePath = path.join(app.getAppPath(), 'engine.py');
    const pythonPath = path.join(app.getAppPath(), 'scratch', 'venv', 'Scripts', 'python.exe');
    pythonProcess = spawn(pythonPath, [enginePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  }

  pythonProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (mainWindow) {
          mainWindow.webContents.send('engine-message', msg);
        }
      } catch (e) {
        console.error("Failed to parse from python:", line);
      }
    }
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setDevicePermissionHandler(() => true);

  startPythonEngine();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

// Forward commands to python
ipcMain.handle('engine-command', async (event, command) => {
  if (pythonProcess && pythonProcess.stdin) {
    pythonProcess.stdin.write(JSON.stringify(command) + '\n');
  }
});
