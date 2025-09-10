import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Role = 'super_admin' | 'tenant_admin' | 'staff'

interface Payload {
  email: string
  new_password: string
  tenant_id: string
  role?: Role
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, new_password, tenant_id, role } = (await req.json()) as Payload

    if (!email || !new_password || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'email, new_password e tenant_id são obrigatórios' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Carregar perfil do chamador
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, tenant_id')
      .eq('id', userData.user.id)
      .maybeSingle()

    // Verificar se existe algum super_admin (modo bootstrap)
    const { data: superAdmins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'super_admin')
      .limit(1)

    const isBootstrapMode = !superAdmins || superAdmins.length === 0

    if (!isBootstrapMode) {
      const isSuperAdmin = callerProfile?.role === 'super_admin'
      const isTenantAdmin = callerProfile?.role === 'tenant_admin' && callerProfile?.tenant_id === tenant_id
      if (!isSuperAdmin && !isTenantAdmin) {
        return new Response(JSON.stringify({ error: 'Acesso negado' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Tenta criar o usuário (confirmado). Se já existir, vamos localizar e atualizar senha
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: new_password,
      email_confirm: true,
    })

    let userId = created?.user?.id as string | undefined

    if (createErr && !userId) {
      // Usuário pode já existir, localizar por listagem
      let foundId: string | undefined
      let page = 1
      const perPage = 200
      for (;;) {
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
        if (listErr) break
        const match = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
        if (match) {
          foundId = match.id
          break
        }
        if (!list || list.users.length < perPage) break
        page += 1
      }
      userId = foundId
      if (!userId) {
        // Se não achamos, retornar erro original
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Atualiza senha e confirma e-mail
    if (userId) {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: new_password,
        email_confirm: true,
      })
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const assignedRole: Role = role || 'tenant_admin'

    // Upsert no perfil com tenant
    const { error: upsertErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId!, email, role: assignedRole, tenant_id }, { onConflict: 'id' })
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, role: assignedRole }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('tenant-reset-password error:', error?.message || error)
    return new Response(JSON.stringify({ error: error?.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})