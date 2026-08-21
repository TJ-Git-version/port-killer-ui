'use strict';

/**
 * 安全桥接：通过 contextBridge 只暴露最小 API 给渲染进程，
 * 渲染进程无法直接访问 Node.js 能力。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('portTool', {
  queryPort: (port) => ipcRenderer.invoke('query-port', port),
  queryPortRange: (rangeText) => ipcRenderer.invoke('query-port-range', rangeText),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  isAdmin: () => ipcRenderer.invoke('is-admin'),
  relaunchAsAdmin: () => ipcRenderer.invoke('relaunch-admin'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update-event', listener);
    return () => ipcRenderer.removeListener('update-event', listener);
  },
});
