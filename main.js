const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

let mainWindow;
let tray;

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CREDS_PATH = path.join(CLAUDE_DIR, '.credentials.json');
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 320,
    height: 250,
    x: screenWidth - 340,
    y: screenHeight - 270,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile('index.html');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Windows 11 DWM redraws the caption when the window loses focus on transparent
  // frameless windows. Force a 1px repaint on blur to suppress it.
  mainWindow.on('blur', () => {
    const [w, h] = mainWindow.getSize();
    mainWindow.setSize(w + 1, h);
    mainWindow.setSize(w, h);
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Claude Usage Monitor');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: 'separator' },
    { label: 'Refresh', click: () => mainWindow.webContents.send('refresh') },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.resize({ width: 16, height: 16 });
}

// --- HTTP helpers ---

function httpsRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000,
    };

    const req = https.request(opts, (res) => {
      const headers = res.headers;
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// --- OAuth token management ---

function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCredentials(creds) {
  fs.writeFileSync(CREDS_PATH, JSON.stringify(creds));
}

async function getValidToken() {
  const creds = readCredentials();
  if (!creds?.claudeAiOauth) throw new Error('No Claude credentials found. Run "claude" CLI to login.');

  const oauth = creds.claudeAiOauth;

  // If token is still valid (with 5min buffer), use it
  if (oauth.accessToken && oauth.expiresAt && Date.now() + 300000 < oauth.expiresAt) {
    return oauth.accessToken;
  }

  // Refresh the token
  if (!oauth.refreshToken) throw new Error('No refresh token available. Run "claude /login".');

  const res = await httpsRequest(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    grant_type: 'refresh_token',
    refresh_token: oauth.refreshToken,
    client_id: CLIENT_ID,
    scope: (oauth.scopes || ['user:profile', 'user:inference', 'user:sessions:claude_code', 'user:mcp_servers']).join(' '),
  });

  if (res.status !== 200) throw new Error(`Token refresh failed: ${res.status}`);

  const newOauth = {
    ...oauth,
    accessToken: res.body.access_token,
    refreshToken: res.body.refresh_token || oauth.refreshToken,
    expiresAt: Date.now() + res.body.expires_in * 1000,
  };

  writeCredentials({ ...creds, claudeAiOauth: newOauth });
  return newOauth.accessToken;
}

// --- Fetch rate limit data via minimal API call ---

async function fetchRateLimits() {
  const token = await getValidToken();

  const res = await httpsRequest(MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
      'content-type': 'application/json',
    },
  }, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1,
    messages: [{ role: 'user', content: '1' }],
  });

  // Parse rate limit headers
  const h = res.headers;
  const limits = {};

  // Session (5h) limit
  if (h['anthropic-ratelimit-unified-5h-utilization'] !== undefined) {
    limits.session = {
      utilization: parseFloat(h['anthropic-ratelimit-unified-5h-utilization']) * 100,
      resetsAt: parseInt(h['anthropic-ratelimit-unified-5h-reset']) * 1000,
      status: h['anthropic-ratelimit-unified-5h-status'],
    };
  }

  // Weekly (7d) limit
  if (h['anthropic-ratelimit-unified-7d-utilization'] !== undefined) {
    limits.weekly = {
      utilization: parseFloat(h['anthropic-ratelimit-unified-7d-utilization']) * 100,
      resetsAt: parseInt(h['anthropic-ratelimit-unified-7d-reset']) * 1000,
      status: h['anthropic-ratelimit-unified-7d-status'],
    };
  }

  // Overall
  limits.overallStatus = h['anthropic-ratelimit-unified-status'];
  limits.overageStatus = h['anthropic-ratelimit-unified-overage-status'];
  limits.overageDisabledReason = h['anthropic-ratelimit-unified-overage-disabled-reason'];
  limits.representativeClaim = h['anthropic-ratelimit-unified-representative-claim'];

  return limits;
}

// --- Read local Claude Code data ---

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function getLatestBackup() {
  const backupDir = path.join(CLAUDE_DIR, 'backups');
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('.claude.json.backup.'))
      .sort().reverse();
    if (files.length > 0) return readJsonSafe(path.join(backupDir, files[0]));
  } catch {}
  return null;
}

function getLocalUsageData() {
  const stats = readJsonSafe(path.join(CLAUDE_DIR, 'stats-cache.json'));
  const backup = getLatestBackup();

  const projects = [];
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheRead = 0;
  const modelTotals = {};

  if (backup?.projects) {
    for (const [projectPath, data] of Object.entries(backup.projects)) {
      if (data.lastCost > 0) {
        const shortPath = projectPath.replace(/^C:[/\\]Users[/\\][^/\\]+[/\\]/, '~/');
        projects.push({
          path: shortPath,
          cost: data.lastCost,
          inputTokens: data.lastTotalInputTokens || 0,
          outputTokens: data.lastTotalOutputTokens || 0,
          modelUsage: data.lastModelUsage || {},
        });
        totalCost += data.lastCost;
        totalInputTokens += data.lastTotalInputTokens || 0;
        totalOutputTokens += data.lastTotalOutputTokens || 0;
        totalCacheRead += data.lastTotalCacheReadInputTokens || 0;

        if (data.lastModelUsage) {
          for (const [model, usage] of Object.entries(data.lastModelUsage)) {
            if (!modelTotals[model]) modelTotals[model] = { inputTokens: 0, outputTokens: 0, costUSD: 0 };
            modelTotals[model].inputTokens += usage.inputTokens || 0;
            modelTotals[model].outputTokens += usage.outputTokens || 0;
            modelTotals[model].costUSD += usage.costUSD || 0;
          }
        }
      }
    }
  }

  projects.sort((a, b) => b.cost - a.cost);

  return {
    stats,
    account: {
      name: backup?.oauthAccount?.displayName || 'Unknown',
      email: backup?.oauthAccount?.emailAddress || '',
    },
    totals: { cost: totalCost, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, cacheRead: totalCacheRead },
    models: modelTotals,
    projects,
  };
}

// --- Settings persistence ---
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); }
  catch { return { opacity: 55 }; }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// --- Auto-launch ---
function getAutoLaunch() {
  const loginSettings = app.getLoginItemSettings();
  return loginSettings.openAtLogin;
}

function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: ['--hidden'],
  });
}

// IPC handlers
ipcMain.handle('get-usage', () => getLocalUsageData());
ipcMain.handle('get-limits', () => fetchRateLimits());
ipcMain.handle('get-opacity', () => loadSettings().opacity);
ipcMain.handle('save-opacity', (_, val) => {
  const settings = loadSettings();
  settings.opacity = val;
  saveSettings(settings);
});
ipcMain.handle('get-auto-launch', () => getAutoLaunch());
ipcMain.handle('set-auto-launch', (_, enabled) => setAutoLaunch(enabled));
ipcMain.handle('get-theme', () => loadSettings().theme || 'dark');
ipcMain.handle('save-theme', (_, theme) => {
  const settings = loadSettings();
  settings.theme = theme;
  saveSettings(settings);
});

// macOS: hide dock icon
if (process.platform === 'darwin') app.dock.hide();

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { app.isQuitting = true; });
