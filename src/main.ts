import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  nativeTheme,
  protocol,
  safeStorage,
  shell,
  utilityProcess,
  type UtilityProcess,
} from 'electron';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { commandSchema } from './shared/contracts';
import { z } from 'zod';
import { APP_NAME } from './shared/branding';

protocol.registerSchemesAsPrivileged([
  { scheme: 'relay', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
// Keep the existing installation's data location across the product rename.
app.setPath(
  'userData',
  process.env.RELAY_DATA_DIR
    ? resolve(process.env.RELAY_DATA_DIR)
    : join(app.getPath('appData'), 'Relay'),
);
app.setName(APP_NAME);
nativeTheme.themeSource = 'dark';
let win: BrowserWindow | null = null;
let worker: UtilityProcess;
let sequence = 1;
let exiting = false;
const pending = new Map<
  number,
  { resolve: (value: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>();
const workspaceSchema = z.enum(['personal', 'demo']);
function request(message: unknown): Promise<any> {
  const id = sequence++;
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Runtime request timed out.'));
    }, 45000);
    pending.set(id, { resolve: resolvePromise, reject, timer });
    worker.postMessage({ ...(message as object), id });
  });
}
function sender(event: Electron.IpcMainInvokeEvent) {
  if (
    !win ||
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame ||
    !event.senderFrame.url.startsWith('relay://app/')
  )
    throw new Error('Untrusted IPC sender.');
}
async function external(raw: unknown) {
  const text = z.string().max(3000).parse(raw);
  const url = new URL(text);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Only HTTPS links without embedded credentials can be opened.');
  await shell.openExternal(url.href);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    win?.restore();
    win?.focus();
  });
  void app
    .whenReady()
    .then(async () => {
      const uiRoot = join(__dirname, 'ui');
      protocol.handle('relay', (req) => {
        const url = new URL(req.url);
        if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
        const target = resolve(
          uiRoot,
          `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
        );
        const rel = relative(uiRoot, target);
        if (rel.startsWith('..') || isAbsolute(rel))
          return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(target).href);
      });
      const dataDir = app.getPath('userData');
      mkdirSync(dataDir, { recursive: true });
      worker = utilityProcess.fork(join(__dirname, 'runtime', 'worker.cjs'), [dataDir], {
        serviceName: 'Autobase local runtime',
        stdio: 'pipe',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([k, v]) => v !== undefined && !/API_KEY|AUTH_TOKEN|ELECTRON_RUN_AS_NODE/.test(k),
          ),
        ) as Record<string, string>,
      });
      worker.stdout?.on('data', () => {});
      worker.stderr?.on('data', () => {});
      worker.on('message', (data) => {
        if (data.type === 'event') win?.webContents.send('relay:event', data.event);
        else if (data.id) {
          const p = pending.get(data.id);
          if (!p) return;
          pending.delete(data.id);
          clearTimeout(p.timer);
          if (data.error) p.reject(new Error(data.error));
          else p.resolve(data.result);
        }
      });
      worker.on('exit', (code) => {
        for (const p of pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error(`Local runtime exited (${code}). Relaunch Autobase to recover work.`));
        }
        pending.clear();
        if (!exiting)
          win?.webContents.send('relay:event', {
            workspace: 'personal',
            kind: 'runtime_error',
            text: 'The local runtime stopped. Relaunch Autobase to recover retained work.',
          });
      });
      const keyPath = join(dataDir, 'claude-key.encrypted');
      if (existsSync(keyPath) && safeStorage.isEncryptionAvailable()) {
        try {
          await request({ type: 'key', key: safeStorage.decryptString(readFileSync(keyPath)) });
        } catch {
          /* UI readiness reports missing credentials if DPAPI cannot decrypt. */
        }
      }
      ipcMain.handle('relay:command', (event, workspace, raw) => {
        sender(event);
        return request({
          type: 'command',
          workspace: workspaceSchema.parse(workspace),
          command: commandSchema.parse(raw),
        });
      });
      ipcMain.handle('relay:folder', async (event, ws) => {
        sender(event);
        const workspace = workspaceSchema.parse(ws);
        const result = await dialog.showOpenDialog(win!, {
          title: 'Choose a project folder for read access',
          properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        const folder = result.filePaths[0];
        if (
          resolve(folder) === resolve(homedir()) ||
          /^[A-Z]:[\\/]?$/i.test(folder) ||
          /[\\/]\.(codex|claude|ssh)([\\/]|$)/i.test(folder)
        )
          throw new Error(
            'Choose a project folder rather than a home, drive, or credential directory.',
          );
        await request({ type: 'folder', workspace, folder });
        return folder;
      });
      ipcMain.handle('relay:key', async (event, raw) => {
        sender(event);
        const key = z.string().max(500).parse(raw).trim();
        if (!key) {
          if (existsSync(keyPath)) rmSync(keyPath);
          await request({ type: 'key', key: '' });
          return;
        }
        if (!key.startsWith('sk-ant-'))
          throw new Error('Enter an Anthropic API key. Subscription tokens are not supported.');
        if (!safeStorage.isEncryptionAvailable())
          throw new Error('Windows credential encryption is unavailable. No key was stored.');
        writeFileSync(keyPath, safeStorage.encryptString(key));
        await request({ type: 'key', key });
      });
      ipcMain.handle('relay:artifact', async (event, ws, raw) => {
        sender(event);
        const path = await request({
          type: 'command',
          workspace: workspaceSchema.parse(ws),
          command: { action: 'artifact_path', id: z.string().max(100).parse(raw) },
        });
        const error = await shell.openPath(path);
        if (error) throw new Error(error);
      });
      ipcMain.handle('relay:external', async (event, url) => {
        sender(event);
        await external(url);
      });
      win = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 960,
        minHeight: 640,
        title: APP_NAME,
        backgroundColor: '#171719',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
          preload: join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          spellcheck: true,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (e) => e.preventDefault());
      win.webContents.on('will-attach-webview', (e) => e.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_webContents, _permission, cb) =>
        cb(false),
      );
      win.webContents.session.setPermissionCheckHandler(() => false);
      win.once('ready-to-show', () => win?.show());
      await win.loadURL('relay://app/index.html');
    })
    .catch((e) => {
      dialog.showErrorBox('Autobase could not start', String(e));
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (exiting || !worker) return;
    event.preventDefault();
    exiting = true;
    void request({ type: 'stop' })
      .catch(() => worker.kill())
      .finally(() => app.quit());
  });
}
