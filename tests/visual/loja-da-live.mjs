// Capturas de tela da Loja da Live (/t/loja/live) para garantir que o LAYOUT não muda na unificação dos checkouts.
//
// Sobe o front localmente (vite) e abre a página num Chrome sem janela. TODA chamada ao servidor é respondida aqui,
// com dados fixos: nada vai ao Supabase de produção, nenhum carrinho, reserva ou pedido real é criado.
// O relógio é congelado para a contagem regressiva sair sempre igual.
//
//   npm run capturar   → grava as capturas de referência em referencia/
//   npm run comparar   → tira as capturas de novo e compara pixel a pixel com referencia/ (diferenças em diferencas/)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const COMPARAR = process.argv.includes('--comparar');
const PORTA = 5199;
const BASE_URL = `http://localhost:${PORTA}`;
const REF = path.join(AQUI, 'referencia');
const NOVAS = path.join(AQUI, COMPARAR ? 'atuais' : 'referencia');
const DIF = path.join(AQUI, 'diferencas');
const AGORA = new Date('2026-11-21T19:00:00-03:00');

// ------------------------------------------------------------------ dados fixos (fictícios)
const TENANT = { id: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Loja Exemplo', slug: 'exemplo', logo_url: null, primary_color: '#7c3aed' };
const produto = (id, code, name, price, was = null, stock = 5) => ({ key: `p${id}`, id, code, name, image_url: null, is_live: id <= 2, price, was, stock, variants: [] });
const ITENS = [
  produto(1, 'C101', 'Colar Aurora Dourado', 89.9, 119.9),
  produto(2, 'C102', 'Brinco Gota Cristal', 49.9),
  produto(3, 'C103', 'Pulseira Elos Finos', 59.9),
  produto(4, 'C104', 'Anel Solitário Prata', 39.9, 49.9),
  produto(5, 'C105', 'Choker Pérolas', 69.9),
  produto(6, 'C106', 'Tornozeleira Estrela', 29.9, null, 1),
];
const CATALOGO = {
  ok: true, items: ITENS, total: ITENS.length, offset: 0, limit: 40, version: 'v1',
  tenant: TENANT,
  coupons: [{ code: 'BEMVINDA', discount_type: 'percentage', discount_value: 10, min_purchase_amount: 0, min_items_quantity: 0, progressive_tiers: null, apply_to_promotional: true, auto_apply: false, description: '10% na primeira compra', expires_at: null }],
  gifts: [{ name: 'Bolsinha de presente', minimum_purchase_amount: 120, left: 10 }],
  shipping_hints: [{ name: 'Entrega padrão', price: 15.9, free_min: 200, pickup: false }, { name: 'Retirada na loja', price: 0, free_min: null, pickup: true }],
  payment: { pix: true, card: true, pay_on_pickup: false, pix_discount_percent: 5, requires_email: false, card_installments: null },
  settings: { reserve_mode: 'order', cart_minutes: 30, close_at: null, open_order: false },
  affiliate: null, flashes: [], now: AGORA.toISOString(),
};
const CLIENTE = { name: 'Cliente Exemplo', phone: '11900000000', cpf: '52998224725', email: 'cliente@exemplo.com', cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: 'Ap 1', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' };
const FRETES = [
  { id: 1, tenant_id: TENANT.id, name: 'Entrega padrão', price: 15.9, delivery_days: 5, description: 'Chega em 5 a 8 dias úteis', is_active: true, channel: 'live', free_shipping_min_order: 200, coverage_type: 'all', created_at: '2026-01-01T00:00:00Z' },
  { id: 2, tenant_id: TENANT.id, name: 'Retirada na loja', price: 0, delivery_days: 0, description: null, is_active: true, channel: 'live', free_shipping_min_order: null, coverage_type: 'all', created_at: '2026-01-02T00:00:00Z' },
];

function respostaLiveShop(body) {
  switch (body?.action) {
    case 'catalog': return CATALOGO;
    case 'catalog_version': return { ok: true, version: 'v1' };
    case 'recognize': return { ok: true, customer: null };
    case 'customer_lookup': return { ok: true, found: true, complete: true, customer: CLIENTE };
    case 'customer_save': return { ok: true, customer: CLIENTE };
    case 'coupon_check': return { ok: true, valid: true, discount: 0, code: body.code };
    case 'cart_state': return { ok: true, order_id: null, lines: [] };
    case 'reserve': return { ok: true, reserved: body.qty };
    default: return { ok: false, error: 'Ação não simulada no teste visual.' };
  }
}

async function simularServidor(page) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(BASE_URL)) return route.continue();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.includes('/functions/v1/live-shop')) return json(respostaLiveShop(req.postDataJSON()));
    if (url.includes('/functions/v1/')) return json({});
    if (url.includes('/rest/v1/custom_shipping_options')) return json(FRETES);
    if (url.includes('/rest/v1/rpc/')) return json([]);
    if (url.includes('/rest/v1/')) {
      const umSo = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return umSo ? route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }) : json([]);
    }
    if (url.includes('viacep.com.br')) return json({ cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' });
    if (/\.(css)(\?|$)/.test(url) || url.includes('fonts.googleapis')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.fulfill({ status: 204, body: '' }); // imagens/scripts de terceiros: nada sai daqui
  });
}

// ------------------------------------------------------------------ roteiro das telas
async function capturar(page, nome) {
  await page.waitForTimeout(400);
  const arquivo = path.join(NOVAS, `${nome}.png`);
  await page.screenshot({ path: arquivo, fullPage: true, animations: 'disabled', caret: 'hide' });
  return arquivo;
}

async function roteiro(page, prefixo) {
  const tiradas = [];
  await page.goto(`${BASE_URL}/t/exemplo/live`, { waitUntil: 'networkidle' });
  await page.getByText('Colar Aurora Dourado').first().waitFor();
  tiradas.push(await capturar(page, `${prefixo}-1-vitrine`));

  const adicionar = page.getByRole('button', { name: 'Adicionar ao carrinho' });
  await adicionar.nth(0).click();
  await page.waitForTimeout(300);
  await adicionar.nth(1).click();
  await page.waitForTimeout(300);
  await page.clock.runFor(4000); // o aviso "Adicionado ao carrinho" some (relógio congelado anda 4 s)
  await page.getByRole('button', { name: 'Abrir carrinho' }).click();
  await page.getByText('Cupom de desconto').waitFor();
  tiradas.push(await capturar(page, `${prefixo}-2-carrinho`));

  await page.getByLabel('Código do cupom').fill('BEMVINDA');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.waitForTimeout(400);
  await page.clock.runFor(4000);
  tiradas.push(await capturar(page, `${prefixo}-3-carrinho-com-cupom`));

  await page.getByRole('button', { name: /Finalizar compra/ }).click();
  await page.getByText('Qual é o seu celular?').waitFor();
  tiradas.push(await capturar(page, `${prefixo}-4-celular`));

  await page.locator('#ls-phone').fill('11900000000');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByText('Resumo do pedido').waitFor();
  await page.getByText('Calculando frete…').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.clock.runFor(4000); // o aviso "Encontramos seu cadastro" some
  tiradas.push(await capturar(page, `${prefixo}-5-finalizar`));
  return tiradas;
}

// ------------------------------------------------------------------ comparação
function comparar(nome) {
  const a = PNG.sync.read(readFileSync(path.join(REF, nome)));
  const b = PNG.sync.read(readFileSync(path.join(NOVAS, nome)));
  if (a.width !== b.width || a.height !== b.height) return { nome, diferentes: -1, motivo: `tamanho mudou: ${a.width}x${a.height} → ${b.width}x${b.height}` };
  const dif = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, dif.data, a.width, a.height, { threshold: 0.05 });
  if (n > 0) writeFileSync(path.join(DIF, nome), PNG.sync.write(dif));
  return { nome, diferentes: n };
}

async function esperarServidor() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE_URL); if (r.ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('o front não subiu em 60 s');
}

async function main() {
  if (COMPARAR && !existsSync(REF)) throw new Error('sem capturas de referência: rode "npm run capturar" antes de mexer');
  rmSync(NOVAS, { recursive: true, force: true });
  mkdirSync(NOVAS, { recursive: true });
  if (COMPARAR) { rmSync(DIF, { recursive: true, force: true }); mkdirSync(DIF, { recursive: true }); }

  const vite = spawn('npx', ['vite', '--port', String(PORTA), '--strictPort', '--host', '127.0.0.1'], { cwd: RAIZ, stdio: 'ignore', detached: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none', '--disable-gpu'] });
  const arquivos = [];
  try {
    await esperarServidor();
    const telas = [
      ['celular', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
      ['computador', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }],
    ];
    for (const [nome, opcoes] of telas) {
      const ctx = await browser.newContext({ ...opcoes, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.clock.install({ time: AGORA });
      await simularServidor(page);
      arquivos.push(...(await roteiro(page, nome)));
      await ctx.close();
    }
  } finally {
    await browser.close();
    try { process.kill(-vite.pid); } catch { /* já saiu */ }
  }

  const nomes = arquivos.map((a) => path.basename(a));
  if (!COMPARAR) { console.log(`capturas de referência gravadas: ${nomes.length}\n${nomes.join('\n')}`); return; }
  const resultado = nomes.map(comparar);
  for (const r of resultado) console.log(`${r.diferentes === 0 ? 'IGUAL     ' : 'DIFERENTE '} ${r.nome}${r.diferentes ? ` (${r.motivo || r.diferentes + ' pixels'})` : ''}`);
  if (resultado.some((r) => r.diferentes !== 0)) { console.log(`\nveja as diferenças marcadas em ${DIF}`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
