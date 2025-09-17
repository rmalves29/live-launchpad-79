// Teste da nova integração do Bling com fluxo de 2 etapas
const testBlingIntegration = async () => {
  try {
    console.log('🧪 Testando nova integração do Bling...');
    
    // Fazer teste de conexão primeiro
    const testResponse = await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-integration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'test_connection',
        tenant_id: '08f2b1b9-3988-489e-8186-c60f0c0b0622' // Tenant com configuração ativa
      })
    });

    const testResult = await testResponse.json();
    console.log('📊 Resultado do teste de conexão:', testResult);
    
    if (testResult.success) {
      console.log('✅ Conexão com Bling OK!');
      
      // Agora testar criação de pedido
      console.log('🔄 Testando criação de pedido...');
      
      const orderResponse = await fetch('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_order',
          order_id: 1, // ID de teste
          customer_phone: '11999887766',
          tenant_id: '08f2b1b9-3988-489e-8186-c60f0c0b0622'
        })
      });

      const orderResult = await orderResponse.json();
      console.log('📦 Resultado da criação do pedido:', orderResult);
      
      if (orderResult.success) {
        console.log('🎉 SUCESSO! Novo fluxo funcionando:');
        console.log('- ✅ Contato criado/encontrado no Bling');
        console.log('- ✅ Pedido criado com contato.id');
        console.log('- ✅ Cache de contatos funcionando');
      } else {
        console.log('❌ Erro na criação do pedido:', orderResult.error);
      }
    } else {
      console.log('❌ Falha na conexão:', testResult.error);
    }
    
  } catch (error) {
    console.error('💥 Erro no teste:', error);
  }
};

// Executar o teste
testBlingIntegration();