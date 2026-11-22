import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeLinkPreview } from '../supabase/functions/_shared/store-link-preview.ts';
import { sendText } from '../supabase/functions/_shared/uazapi-api.ts';

const context = { supabaseUrl: 'https://project.supabase.co', publicKey: 'public-key' };
const link = 'https://app.cartzy.com.br/t/lagrandame/cadastro-instagram';

test('outgoing WhatsApp payload embeds the store logo and name while preserving text and recipient', async () => {
  const previousFetch = globalThis.fetch, previousDeno = globalThis.Deno;
  const sent = [];
  try {
    globalThis.Deno = { env: { get: key => ({SUPABASE_URL:context.supabaseUrl,SUPABASE_ANON_KEY:context.publicKey})[key] } };
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith(context.supabaseUrl)) {
        assert.equal(new URL(url).searchParams.get('slug'), 'eq.lagrandame');
        return Response.json([{name:'La Grandame',logo_url:'https://example.com/la-grandame.jpg'}]);
      }
      sent.push({ url: String(url), body: JSON.parse(init.body), token:init.headers.token });
      return Response.json({id:'mock-message'});
    };
    const text = `Faça seu cadastro: ${link}`;
    const result = await sendText({url:'https://instance.example.com',token:'store-token'},'group@g.us',text);
    assert.equal(result.success,true);
    assert.equal(sent.length,1);
    assert.deepEqual(sent[0], {url:'https://instance.example.com/send/text',token:'store-token',body:{
      number:'group@g.us',text,linkPreview:true,linkPreviewTitle:'La Grandame',
      linkPreviewDescription:' ',linkPreviewImage:'https://example.com/la-grandame.jpg',linkPreviewLarge:true,
    }});
  } finally { globalThis.fetch=previousFetch; globalThis.Deno=previousDeno; }
});

test('each link resolves its own store including checkout, without cached branding from another store', async () => {
  const fetcher=async url => Response.json([{name:new URL(url).searchParams.get('slug'),logo_url:`https://example.com/${new URL(url).searchParams.get('slug')}.jpg`}]);
  const results=await Promise.all(['lagrandame','outra'].map(slug=>storeLinkPreview(`https://app.cartzy.com.br/t/${slug}/checkout?order=123`,{...context,fetcher})));
  assert.equal(results[0].linkPreviewTitle,'eq.lagrandame');
  assert.equal(results[1].linkPreviewTitle,'eq.outra');
});

test('plain text, payment links, unrelated hosts and a store link after an external first link remain unchanged', async () => {
  for (const text of ['Olá!', 'https://pagamento.example.com/pay', 'https://app.cartzy.com.br.evil.example/t/lagrandame/checkout', `https://example.com ${link}`]) {
    const result=await storeLinkPreview(text,{...context,fetcher:()=>{throw new Error('must not query');}});
    assert.equal(result,undefined);
  }
});

test('missing logo, inactive stores, lookup failures and unsafe image URLs suppress platform fallback without blocking text', async () => {
  for (const rows of [[],[{name:'La Grandame',logo_url:null}],[{name:'La Grandame',logo_url:'javascript:alert(1)'}]]) {
    assert.deepEqual(await storeLinkPreview(link,{...context,fetcher:async()=>Response.json(rows)}),{linkPreview:false});
  }
  assert.deepEqual(await storeLinkPreview(link,{...context,fetcher:async()=>{throw new Error('timeout');}}),{linkPreview:false});
});
