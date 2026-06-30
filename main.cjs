const { app, BrowserWindow } = require('electron');
const path = require('path');
// require('dotenv').config();

function createWindow() {
    const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // 加入這行確保資源載入
        }
    });

    // 這裡加入開啟開發者工具
    if (process.env.APP_ENV !== 'production') {
        win.webContents.openDevTools();
    }
    // 載入 Vite 打包後的 index.html
    win.loadFile(path.join(__dirname, 'build/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});