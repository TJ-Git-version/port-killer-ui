'use strict';

/**
 * 端口占用关闭工具 - Electron 主进程
 * 负责执行系统命令（netstat / tasklist / taskkill）并通过 IPC 暴露给渲染进程，
 * 同时处理管理员权限检测与提权重启。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { validatePort, parseTasklistNames, collectPortProcesses } = require('./src/core');

/** 执行系统命令，返回 { code, stdout, stderr } */
function runCommand(cmd, args, maxBuffer = 4 * 1024 * 1024) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code || -1 : 0,
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}

/** 当前进程是否具有管理员权限（net session 需要管理员权限） */
async function isAdmin() {
  const res = await runCommand('net', ['session']);
  return res.code === 0;
}

/** 以管理员身份重新启动本应用（触发 UAC），随后退出当前实例 */
function relaunchAsAdmin() {
  const exe = process.execPath;
  const appPath = app.getAppPath();
  const ps = `Start-Process -FilePath '${exe}' -ArgumentList '"${appPath}"' -Verb RunAs`;
  const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', () => {});
  child.unref();
  setTimeout(() => app.quit(), 300);
}

// ---------------------------------------------------------------- IPC

ipcMain.handle('query-port', async (_event, portText) => {
  const port = validatePort(portText);
  if (port === null) {
    return { ok: false, error: '端口号无效，请输入 1~65535 之间的整数。' };
  }
  try {
    const [netstatRes, tasklistRes] = await Promise.all([
      runCommand('netstat', ['-ano']),
      runCommand('tasklist', ['/FO', 'CSV', '/NH']),
    ]);
    if (netstatRes.code !== 0) {
      return { ok: false, error: `netstat 执行失败（返回码 ${netstatRes.code}）：${netstatRes.stderr}` };
    }
    const names = parseTasklistNames(tasklistRes.stdout);
    const { results, skipped } = collectPortProcesses(netstatRes.stdout, port, names);
    return { ok: true, port, results, skipped };
  } catch (err) {
    return { ok: false, error: `查询出错：${err.message}` };
  }
});

ipcMain.handle('kill-process', async (_event, pid) => {
  const res = await runCommand('taskkill', ['/PID', String(pid), '/F']);
  const detail = (res.stderr || res.stdout || '').trim();
  if (res.code === 0) {
    return { ok: true, message: `已结束 PID ${pid}` + (detail ? `：${detail}` : '') };
  }
  if (res.code === 5 || /拒绝访问|Access is denied/i.test(detail)) {
    return { ok: false, code: 'denied', message: `权限不足，无法结束 PID ${pid}。` };
  }
  if (res.code === 128 || /not found|没有找到/i.test(detail)) {
    return { ok: false, code: 'gone', message: `PID ${pid} 已不存在。` };
  }
  return { ok: false, code: 'error', message: `结束 PID ${pid} 失败（返回码 ${res.code}）：${detail}` };
});

ipcMain.handle('is-admin', async () => ({ admin: await isAdmin() }));

ipcMain.handle('relaunch-admin', () => {
  relaunchAsAdmin();
  return { ok: true };
});

// ---------------------------------------------------------------- 窗口

function createWindow() {
  const win = new BrowserWindow({
    width: 1020,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    show: false,
    title: '端口占用关闭工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  if (process.env.PORT_KILLER_SMOKE) {
    win.webContents.once('did-finish-load', () => {
      console.log('SMOKE_READY');
      setTimeout(() => app.quit(), 800);
    });
  }

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
