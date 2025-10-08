// Script de diagnóstico para identificar problemas com WhatsApp
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://omctxrcluiojyhttymeu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tY3R4cmNsdWlvanlodHR5bWV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczOTY2MzM1NCwiZXhwIjoyMDU1MjM5MzU0fQ.SDdSO6rr8vKGlbpFuBQSoIvFuSaRHZRv5OAH5yXSwJ4';

async function diagnosticar() {
  console.log('\n🔍 DIAGNÓSTICO DO SERVIDOR WHATSAPP\n');
  console.log('='.repeat(60));

  try {
    // 1. Verificar conexão com Supabase
    console.log('\n1️⃣ Verificando conexão com Supabase...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/tenants?select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      console.log('❌ ERRO: Não foi possível conectar ao Supabase');
      console.log(`   Status: ${response.status}`);
      return;
    }
    console.log('✅ Conexão com Supabase OK');

    // 2. Verificar tenants
    console.log('\n2️⃣ Verificando tenants ativos...');
    const tenants = await response.json();
    
    if (!tenants || tenants.length === 0) {
      console.log('❌ PROBLEMA: Nenhum tenant encontrado no banco de dados');
      console.log('   SOLUÇÃO: Crie um tenant primeiro no sistema');
      return;
    }
    
    console.log(`✅ ${tenants.length} tenant(s) encontrado(s):`);
    tenants.forEach(t => {
      console.log(`   - ${t.name} (ID: ${t.id})`);
    });

    // 3. Verificar integrações WhatsApp
    console.log('\n3️⃣ Verificando integrações WhatsApp...');
    const integResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/integration_whatsapp?select=*&is_active=eq.true`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const integrations = await integResponse.json();
    
    if (!integrations || integrations.length === 0) {
      console.log('❌ PROBLEMA: Nenhuma integração WhatsApp ativa encontrada');
      console.log('   SOLUÇÃO: Ative a integração WhatsApp nas configurações');
      return;
    }

    console.log(`✅ ${integrations.length} integração(ões) ativa(s):`);
    integrations.forEach(i => {
      const tenant = tenants.find(t => t.id === i.tenant_id);
      console.log(`   - Tenant: ${tenant?.name || 'Desconhecido'}`);
      console.log(`     API URL: ${i.api_url || 'Não configurada'}`);
      console.log(`     Webhook: ${i.webhook_url || 'Não configurada'}`);
    });

    // 4. Verificar dependências Node
    console.log('\n4️⃣ Verificando dependências...');
    try {
      require('whatsapp-web.js');
      console.log('✅ whatsapp-web.js instalado');
    } catch (e) {
      console.log('❌ whatsapp-web.js NÃO instalado');
      console.log('   SOLUÇÃO: npm install whatsapp-web.js');
      return;
    }

    try {
      require('qrcode-terminal');
      console.log('✅ qrcode-terminal instalado');
    } catch (e) {
      console.log('❌ qrcode-terminal NÃO instalado');
      console.log('   SOLUÇÃO: npm install qrcode-terminal');
      return;
    }

    // 5. Verificar sessões antigas
    console.log('\n5️⃣ Verificando sessões antigas...');
    const fs = require('fs');
    const authDir = '.wwebjs_auth_v2';
    
    if (fs.existsSync(authDir)) {
      console.log('⚠️ Diretório de sessões encontrado: .wwebjs_auth_v2');
      console.log('   Se o QR não aparecer, execute:');
      console.log('   Remove-Item -Recurse -Force .wwebjs_auth_v2');
    } else {
      console.log('✅ Nenhuma sessão antiga encontrada');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ DIAGNÓSTICO COMPLETO!');
    console.log('\nSe tudo está OK acima, você pode iniciar o servidor:');
    console.log('   node server-whatsapp-v2.js');
    console.log('\nSe o QR não aparecer:');
    console.log('   1. Pare o servidor (Ctrl+C)');
    console.log('   2. Remove-Item -Recurse -Force .wwebjs_auth_v2');
    console.log('   3. taskkill /F /IM chrome.exe');
    console.log('   4. node server-whatsapp-v2.js');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ ERRO durante diagnóstico:', error.message);
    console.error('   Verifique sua conexão com internet e tente novamente\n');
  }
}

diagnosticar();
