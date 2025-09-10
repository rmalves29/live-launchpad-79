// Script para criar usuário via edge function
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://hxtbsieodbtzgcvvkeqx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.vEhnmV_jXgajC_L4TTLM6RSzv8ZRLCV0YO-eBdF6M9E'
)

async function createUser() {
  try {
    const { data, error } = await supabase.functions.invoke('tenant-reset-password', {
      body: {
        email: 'suporte.biquinidathay@gmail.com',
        new_password: '123456789', 
        tenant_id: '3c92bf57-a114-4690-b4cf-642078fc9df9',
        role: 'tenant_admin'
      }
    })
    
    if (error) {
      console.error('Erro:', error)
    } else {
      console.log('Usuário criado:', data)
    }
  } catch (err) {
    console.error('Erro na chamada:', err)
  }
}

createUser()