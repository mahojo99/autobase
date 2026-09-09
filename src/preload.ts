import { contextBridge, ipcRenderer } from 'electron';
import type { RelayBridge, Push } from './shared/contracts';
const bridge: RelayBridge = {
  invoke: (workspace, command) => ipcRenderer.invoke('relay:command', workspace, command),
  subscribe: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, event: Push) => callback(event);
    ipcRenderer.on('relay:event', listener);
    return () => ipcRenderer.removeListener('relay:event', listener);
  },
  selectFolder: (workspace) => ipcRenderer.invoke('relay:folder', workspace),
  setClaudeKey: (key) => ipcRenderer.invoke('relay:key', key),
  setApiKey: (provider, key) => ipcRenderer.invoke('relay:api-key', provider, key),
  signIn: (engine) => ipcRenderer.invoke('relay:sign-in', engine),
  openArtifact: (workspace, id) => ipcRenderer.invoke('relay:artifact', workspace, id),
  openExternal: (url) => ipcRenderer.invoke('relay:external', url),
};
contextBridge.exposeInMainWorld('relay', bridge);
