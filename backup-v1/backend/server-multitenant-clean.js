// server-multitenant-clean.js
// API WhatsApp multi-tenant — Railway
// Dep: express, cors, whatsapp-web.js, qrcode, fs-extra, path, dotenv (opcional)

import express from 'express';
import cors from 'cors';
import whatsappWeb from 'whatsapp-web.js';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const { Client, LocalAuth } = whatsappWeb;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ===== CORS =====
const APP_ORIGIN = process.env.APP_ORIGIN || '*';
app.use(
  cors({
    origin: (origin, cb) => cb(null, true), // se quiser travar, troque para [APP_ORIGIN]
    credentials: true,
  })
);

// ===== Config =====
const PORT = process.env.PORT || 8080;
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'wwebjs_auth');

// Prioridade:
// 1) PUPPETEER_EXECUTABLE_PATH (recomendado pela Railway)
// 2) CHROME_PATH (compatibilidade antiga)
// 3) caminho padrão do Chromium no container
const chromiumEnvVars = [
  'PUPPETEER_EXECUTABLE_PATH',
  'CHROME_PATH',
  'CHROME_BIN',
  'GOOGLE_CHROME_BIN',
  'GOOGLE_CHROME_SHIM',
  'PUPPETEER_CHROME_PATH',
];

const chromiumSystemCandidates = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/lib/chromium-browser/chrome',
  '/app/.cache/ms-playwright/chromium/chrome-linux/chrome',
];

function collectExecutablesUnder(baseDir, visited = new Set()) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  let realBase;
  try {
    realBase = fs.realpathSync(baseDir);
  } catch (err) {
    return [];
  }

  if (visited.has(realBase)) {
    return [];
  }
  visited.add(realBase);

  const results = [];
  const seen = new Set();
  const executableBasenames = new Set(['chrome', 'chrome.exe']);

  const pushUnique = (candidate) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    results.push(candidate);
  };

  for (const entry of fs.readdirSync(realBase)) {
    const candidatePath = path.join(realBase, entry);
    let stats;
    try {
      stats = fs.lstatSync(candidatePath);
    } catch (err) {
      continue;
    }

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      const nestedCandidates = [
        path.join(candidatePath, 'chrome-linux', 'chrome'),
        path.join(candidatePath, 'chrome-linux64', 'chrome'),
        path.join(candidatePath, 'chrome-win', 'chrome.exe'),
        path.join(candidatePath, 'chrome-win64', 'chrome.exe'),
        path.join(candidatePath, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(candidatePath, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chrome'),
        path.join(candidatePath, 'chrome', 'chrome'),
      ];

      for (const nested of nestedCandidates) {
        if (fs.existsSync(nested)) {
          pushUnique(nested);
        }
      }

      for (const nested of collectExecutablesUnder(candidatePath, visited)) {
        pushUnique(nested);
      }
    } else if (stats.isFile() && executableBasenames.has(path.basename(candidatePath))) {
      pushUnique(candidatePath);
    }
  }

  return results;
}

function collectBundledChromium() {
  const bundled = [];
  const searchRoots = [
    path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium'),
    path.join(__dirname, 'node_modules', 'puppeteer', '.local-browsers'),
    path.join(__dirname, 'node_modules', 'puppeteer-core', '.local-chromium'),
    path.join(__dirname, 'node_modules', 'puppeteer-core', '.local-browsers'),
  ];

  for (const root of searchRoots) {
    bundled.push(...collectExecutablesUnder(root));
  }

  return Array.from(new Set(bundled));
}

const chromiumCandidates = Array.from(
  new Set([
    ...chromiumEnvVars.map((key) => process.env[key]).filter(Boolean),
    ...collectBundledChromium(),
    ...chromiumSystemCandidates,
  ])
);

function describeCandidate(candidate, diagnostics, origin) {
  if (!candidate) return null;
  const entry = { path: candidate, origin };
  try {
    const stats = fs.statSync(candidate);
    entry.type = stats.isDirectory() ? 'directory' : 'file';
    if (stats.isDirectory()) {
      entry.status = 'é um diretório';
      diagnostics.push(entry);
      return null;
    }

    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const versionResult = spawnSync(candidate, ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 8000,
      });

      if (versionResult.error) {
        entry.status = 'falha ao executar --version';
        entry.detail = versionResult.error.message;
        diagnostics.push(entry);
        return null;
      }

      if (versionResult.status !== 0) {
        entry.status = 'falha ao executar --version';
        entry.detail = (versionResult.stderr || versionResult.stdout || '').trim();
        diagnostics.push(entry);
        return null;
      }

      const version = (versionResult.stdout || versionResult.stderr || '').trim();
      entry.status = 'ok';
      if (version) {
        entry.version = version;
      }
      diagnostics.push(entry);
      return entry;
    } catch (accessErr) {
      entry.status = 'sem permissão de execução';
      entry.detail = accessErr.message;
      diagnostics.push(entry);
      return null;
    }
  } catch (err) {
    entry.status = err.code === 'ENOENT' ? 'não existe' : 'erro ao verificar';
    entry.detail = err.message;
    diagnostics.push(entry);
    return null;
  }
}

function resolveFromPath(diagnostics) {
  const binaries = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome'];
  const PATH = process.env.PATH || '';
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    for (const binary of binaries) {
      const candidate = path.join(dir, binary);
      const found = describeCandidate(candidate, diagnostics, 'PATH');
      if (found) return found;
    }
  }
  return null;
}

function formatDiagnostics(diagnostics) {
  if (!diagnostics.length) return 'nenhum caminho foi analisado';
  return diagnostics
    .map((entry) => {
      const detailParts = [];
      if (entry.version) {
        detailParts.push(entry.version);
      }
      if (entry.detail) {
        detailParts.push(entry.detail);
      }
      const detail = detailParts.length ? ` (${detailParts.join(' | ')})` : '';
      return `- ${entry.path} [${entry.origin}]: ${entry.status}${detail}`;
    })
    .join('\n');
}

function resolveChromiumExecutable() {
  const diagnostics = [];

  for (const candidate of chromiumCandidates) {
    const found = describeCandidate(candidate, diagnostics, 'lista');
    if (found) {
      const versionSuffix = found.version ? ` (${found.version})` : '';
      console.info('[Chromium] Usando', `${found.path}${versionSuffix}`);
      const summary = formatDiagnostics(diagnostics);
      if (summary) {
        console.info('[Chromium] Diagnóstico de caminhos analisados:\n' + summary);
      }
      return found;
    }
  }

  const pathCandidate = resolveFromPath(diagnostics);
  if (pathCandidate) {
    const versionSuffix = pathCandidate.version ? ` (${pathCandidate.version})` : '';
    console.info('[Chromium] Encontrado via PATH', `${pathCandidate.path}${versionSuffix}`);
    const summary = formatDiagnostics(diagnostics);
    if (summary) {
      console.info('[Chromium] Diagnóstico de caminhos analisados:\n' + summary);
    }
    return pathCandidate;
  }

  const message = formatDiagnostics(diagnostics);
  console.error(
    'Nenhum executável do Chromium/Chrome encontrado. Defina PUPPETEER_EXECUTABLE_PATH com um caminho válido.\n' +
      message
  );
  return null;
}

const resolvedChromium = resolveChromiumExecutable();

if (!resolvedChromium) {
  throw new Error(
    'Não foi possível localizar o executável do Chromium. Configure a variável PUPPETEER_EXECUTABLE_PATH.'
  );
}

const PUPPETEER_EXECUTABLE_PATH = resolvedChromium.path;
const PUPPETEER_EXECUTABLE_VERSION = resolvedChromium.version;

process.env.PUPPETEER_EXECUTABLE_PATH = PUPPETEER_EXECUTABLE_PATH;
if (!process.env.CHROME_PATH) {
  process.env.CHROME_PATH = PUPPETEER_EXECUTABLE_PATH;
}
if (!process.env.CHROME_BIN) {
  process.env.CHROME_BIN = PUPPETEER_EXECUTABLE_PATH;
}
if (!process.env.GOOGLE_CHROME_BIN) {
  process.env.GOOGLE_CHROME_BIN = PUPPETEER_EXECUTABLE_PATH;
}
if (!process.env.GOOGLE_CHROME_SHIM) {
  process.env.GOOGLE_CHROME_SHIM = PUPPETEER_EXECUTABLE_PATH;
}

fs.ensureDirSync(AUTH_DIR);

// ===== Estado em memória =====
/**
 * clients[tenantId] = {
 *   client,
 *   status: 'starting' | 'qr' | 'ready' | 'auth_failure' | 'disconnected' | 'error',
 *   qr: 'data:image/png;base64,...' | null,
 * }
 */
const clients = Object.create(null);

// ===== Helpers =====

// cria (ou retorna) um client de um tenant
async function ensureClient(tenantId) {
  if (clients[tenantId]?.client) return clients[tenantId];

  const sessionDir = path.join(AUTH_DIR, tenantId);
  fs.ensureDirSync(sessionDir);

  // Mesmo efeito do exemplo:
  // args: ['--no-sandbox', '--disable-setuid-sandbox', ...]
  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--single-process',
  ];

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: tenantId,
      dataPath: AUTH_DIR,
    }),
    puppeteer: {
      // equivalente a executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
      executablePath: PUPPETEER_EXECUTABLE_PATH,
      headless: true,
      args: puppeteerArgs,
    },
  });

  clients[tenantId] = {
    client,
    status: 'starting',
    qr: null,
  };

  // Eventos
  client.on('qr', async (qr) => {
    try {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1 });
      clients[tenantId].qr = dataUrl;
      clients[tenantId].status = 'qr';
      console.log(`[${tenantId}] QR gerado`);
    } catch (e) {
      console.error(`[${tenantId}] Falha ao gerar QR:`, e);
    }
  });

  client.on('ready', () => {
    clients[tenantId].status = 'ready';
    clients[tenantId].qr = null;
    console.log(`[${tenantId}] WhatsApp pronto`);
  });

  client.on('authenticated', () => {
    console.log(`[${tenantId}] Autenticado`);
  });

  client.on('auth_failure', (msg) => {
    clients[tenantId].status = 'auth_failure';
    console.error(`[${tenantId}] Falha de auth: ${msg}`);
  });

  client.on('disconnected', (reason) => {
    clients[tenantId].status = 'disconnected';
    console.warn(`[${tenantId}] Desconectado: ${reason}`);
  });

  client.on('change_state', (state) => {
    console.log(`[${tenantId}] Estado: ${state}`);
  });

  // Inicializa
  try {
    await client.initialize();
  } catch (e) {
    clients[tenantId].status = 'error';
    console.error(`[${tenantId}] Erro ao inicializar client:`, e);
  }

  return clients[tenantId];
}

// derruba e apaga a sessão do tenant
async function resetTenant(tenantId) {
  const current = clients[tenantId];
  try {
    if (current?.client) {
      try {
        await current.client.destroy();
      } catch (_) {}
    }
  } catch (_) {}

  // remove pasta LocalAuth
  const sessionFolder = path.join(AUTH_DIR, tenantId);
  try {
    await fs.remove(sessionFolder);
  } catch (e) {
    console.warn(`[${tenantId}] Não conseguiu remover sessão:`, e.message);
  }

  delete clients[tenantId];
  console.log(`[${tenantId}] Sessão resetada`);
}

// ===== Rotas =====
app.get('/', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// status do tenant
app.get('/status/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const entry = await ensureClient(tenantId);
    res.json({
      ok: true,
      tenantId,
      status: entry.status,
      hasQR: Boolean(entry.qr),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'erro status' });
  }
});

// último QR em cache (se existir)
app.get('/qr/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const entry = await ensureClient(tenantId);
    if (entry.qr) {
      // retorna como DataURL (front exibe diretamente)
      res.json({ ok: true, tenantId, qr: entry.qr });
    } else {
      res.json({ ok: false, error: 'QR não disponível (ainda não gerado ou sessão ativa)' });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'erro qr' });
  }
});

// força reconexão (não apaga sessão)
app.post('/reconnect/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    const entry = clients[tenantId];
    if (entry?.client) {
      try {
        await entry.client.destroy();
      } catch (_) {}
      delete clients[tenantId];
    }
    const created = await ensureClient(tenantId);
    res.json({ ok: true, tenantId, status: created.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'erro reconnect' });
  }
});

// RESET total: apaga sessão + re-inicializa (gera novo QR do zero)
app.post('/reset/:tenantId', async (req, res) => {
  const { tenantId } = req.params;
  try {
    await resetTenant(tenantId);
    const created = await ensureClient(tenantId);
    res.json({ ok: true, tenantId, status: created.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'erro reset' });
  }
});

// ===== Start =====
app.listen(PORT, () => {
  console.log(`API online em :${PORT}`);
  console.log(`Auth dir: ${AUTH_DIR}`);
  const versionInfo = PUPPETEER_EXECUTABLE_VERSION ? ` (${PUPPETEER_EXECUTABLE_VERSION})` : '';
  console.log(`Chromium: ${PUPPETEER_EXECUTABLE_PATH}${versionInfo}`);
});
