// Leitor de comentários da live do TikTok -> Cartzy.
// Roda no computador da loja durante a live. Cada comentário é enviado para o Cartzy, que
// reconhece o código do produto (ex.: C200), lança o pedido e manda o WhatsApp pela loja.
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(DIR, 'config.json');
const DEFAULT_ENDPOINT = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/tiktok-live-comment';
const LOG_PATH = join(DIR, `log-${new Date().toISOString().slice(0, 10)}.txt`);

const cor = {
  verde: (t) => `\x1b[32m${t}\x1b[0m`,
  amarelo: (t) => `\x1b[33m${t}\x1b[0m`,
  vermelho: (t) => `\x1b[31m${t}\x1b[0m`,
  cinza: (t) => `\x1b[90m${t}\x1b[0m`,
  negrito: (t) => `\x1b[1m${t}\x1b[0m`,
};

const hora = () => new Date().toLocaleTimeString('pt-BR');
const log = (msg) => {
  console.log(`${cor.cinza(hora())} ${msg}`);
  try { appendFileSync(LOG_PATH, `${hora()} ${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n`); } catch { /* sem log em arquivo */ }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const config = loadConfig();

console.log(cor.negrito('\n=== Cartzy · Leitor da live do TikTok ===\n'));

if (!config.key) {
  console.log('Primeira vez: cole a chave do leitor.');
  console.log(cor.cinza('(No Cartzy: menu Live > Automação TikTok > Configuração > Chave do programa leitor)'));
  config.key = (await rl.question('Chave: ')).trim();
  if (!config.key) { console.log(cor.vermelho('Sem chave não dá para continuar.')); process.exit(1); }
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, endpoint: config.endpoint || DEFAULT_ENDPOINT }, null, 2));
  console.log(cor.verde('Chave salva. Nas próximas vezes não precisa colar de novo.\n'));
}
const ENDPOINT = config.endpoint || DEFAULT_ENDPOINT;

const sugestao = config.last_live ? ` [Enter = @${config.last_live}]` : '';
let liveUser = (await rl.question(`@ da conta que está AO VIVO no TikTok${sugestao}: `)).trim().replace(/^@+/, '');
if (!liveUser && config.last_live) liveUser = config.last_live;
if (!liveUser) { console.log(cor.vermelho('Informe o @ da live.')); process.exit(1); }
writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, endpoint: ENDPOINT, last_live: liveUser }, null, 2));

async function callCartzy(body, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-reader-key': config.key },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error(data.error || 'Chave recusada'), { fatal: true });
      }
      if (res.ok) return data;
      if (i === tentativas) throw new Error(data.error || `Cartzy respondeu ${res.status}`);
    } catch (e) {
      if (e.fatal || i === tentativas) throw e;
    }
    await sleep(1000 * i);
  }
}

let sessionId;
try {
  const start = await callCartzy({ action: 'start', live_username: liveUser });
  sessionId = start.session_id;
  log(cor.verde(`Sessão aberta no Cartzy${start.tenant_name ? ` (${start.tenant_name})` : ''}.`));
} catch (e) {
  console.log(cor.vermelho(`Não consegui falar com o Cartzy: ${e.message}`));
  if (e.fatal) {
    console.log('A chave pode estar errada. Apague o arquivo config.json e abra de novo para colar a chave.');
  }
  await rl.question('Enter para fechar...');
  process.exit(1);
}

// Fila: envia um comentário por vez, na ordem em que chegaram (quem comentou primeiro leva a peça).
const fila = [];
let enviando = false;
async function processarFila() {
  if (enviando) return;
  enviando = true;
  while (fila.length) {
    const c = fila.shift();
    try {
      const r = await callCartzy({ action: 'comment', session_id: sessionId, ...c });
      const quem = `@${c.tiktok_username}`;
      switch (r.status) {
        case 'added': log(cor.verde(`✔ ${quem}: ${r.product} → pedido #${r.order_id} (WhatsApp enviado)`)); break;
        case 'pendente': log(cor.amarelo(`⏳ ${quem}: ${r.product} reservado — SEM CADASTRO, chamar na live`)); break;
        case 'out_of_stock': log(cor.vermelho(`✖ ${quem}: "${c.comment}" — esgotado`)); break;
        case 'not_found': log(cor.cinza(`· ${quem}: "${c.comment}" — código não encontrado`)); break;
        case 'not_for_live': log(cor.cinza(`· ${quem}: "${c.comment}" — produto não está marcado para live`)); break;
        case 'blocked': log(cor.cinza(`· ${quem}: cliente bloqueada`)); break;
        case 'session_closed': log(cor.amarelo('A live foi encerrada no painel do Cartzy. Feche e abra o programa para uma nova live.')); break;
        default: break; // no_code / duplicate: comentário comum, nada a fazer
      }
    } catch (e) {
      log(cor.vermelho(`Falha ao enviar o comentário de @${c.tiktok_username} ("${c.comment}"): ${e.message}`));
    }
  }
  enviando = false;
}

const connection = new TikTokLiveConnection(liveUser);
let encerrando = false;
let liveAcabou = false;

connection.on(WebcastEvent.CHAT, (data) => {
  const user = data?.user || {};
  const username = String(user.uniqueId || data?.uniqueId || '').trim();
  const comment = String(data?.comment || '').trim();
  if (!username || !comment) return;
  const msgId = data?.common?.msgId ?? data?.msgId;
  fila.push({
    tiktok_username: username,
    tiktok_user_id: String(user.userId || data?.userId || ''),
    comment,
    comment_id: msgId ? String(msgId) : `${username}:${comment}:${Date.now()}`,
  });
  processarFila();
});

connection.on(WebcastEvent.STREAM_END, () => {
  liveAcabou = true;
  log(cor.amarelo('A live terminou no TikTok.'));
  encerrar();
});

connection.on(ControlEvent.DISCONNECTED, () => {
  if (encerrando || liveAcabou) return;
  log(cor.amarelo('Conexão com a live caiu. Tentando reconectar...'));
  conectar();
});

connection.on(ControlEvent.ERROR, (err) => {
  const msg = err?.info || err?.exception?.message || '';
  if (msg) log(cor.cinza(`Aviso do TikTok: ${msg}`));
});

async function conectar() {
  while (!encerrando) {
    try {
      await connection.connect();
      log(cor.verde(`Conectado na live de @${liveUser}. Lendo comentários... (Ctrl+C para encerrar)`));
      return;
    } catch (e) {
      const offline = /offline|not.*live|UserOffline/i.test(`${e?.name} ${e?.message}`);
      log(cor.amarelo(offline
        ? `@${liveUser} ainda não está ao vivo. Tentando de novo em 15s...`
        : `Não conectou (${e?.message || e}). Tentando de novo em 15s...`));
      await sleep(15000);
    }
  }
}

async function encerrar() {
  if (encerrando) return;
  encerrando = true;
  log('Encerrando: enviando os últimos comentários...');
  const limite = Date.now() + 20000;
  while ((fila.length || enviando) && Date.now() < limite) await sleep(300);
  try { await connection.disconnect(); } catch { /* já desconectado */ }
  try { await callCartzy({ action: 'end', session_id: sessionId }); log(cor.verde('Live encerrada no Cartzy. A repescagem está no painel.')); } catch { /* painel também encerra */ }
  rl.close();
  process.exit(0);
}

process.on('SIGINT', encerrar);
rl.on('SIGINT', encerrar);

await conectar();
