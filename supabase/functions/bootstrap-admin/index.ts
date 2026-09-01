import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { authEmailForUsuario, corsHeaders, findAuthUserByEmail, getSupabaseSecretKey, json } from '../_shared/auth-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = getSupabaseSecretKey();
const BOOTSTRAP_SECRET = Deno.env.get('BOOTSTRAP_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BOOTSTRAP_SECRET) {
    return json({ error: 'Bootstrap não configurado no servidor' }, 500);
  }

  const suppliedSecret = req.headers.get('x-bootstrap-secret') ?? '';
  if (!suppliedSecret || suppliedSecret !== BOOTSTRAP_SECRET) {
    return json({ error: 'Bootstrap não autorizado' }, 401);
  }

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const usuario = String(payload.usuario ?? '').normalize('NFKC').trim();
  const password = String(payload.password ?? '');
  if (!usuario) return json({ error: 'Informe o usuário administrador' }, 400);
  if (password.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: linkedProfiles, error: linkedError } = await admin
    .from('usuarios_sistema')
    .select('id, usuario, auth_user_id')
    .not('auth_user_id', 'is', null);

  if (linkedError) return json({ error: 'Falha ao verificar bootstrap existente' }, 500);
  if ((linkedProfiles ?? []).length > 0) {
    return json({
      error: 'Bootstrap já concluído: já existe usuário autenticado vinculado',
      usuarios_vinculados: (linkedProfiles ?? []).map((p) => p.usuario),
    }, 409);
  }

  const email = await authEmailForUsuario(usuario);
  const existingResult = await findAuthUserByEmail(admin, email);
  if (existingResult.error) return json({ error: 'Falha ao verificar usuário Auth existente' }, 500);

  let authUser = existingResult.user;
  let reusedExistingAuthUser = false;

  if (authUser) {
    // Recupera bootstrap parcial: a conta Auth já existe, mas nenhum perfil está vinculado.
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(authUser.user_metadata ?? {}), usuario },
    });
    if (updateError || !updated.user) {
      return json({ error: updateError?.message || 'Não foi possível recuperar o administrador existente' }, 400);
    }
    authUser = updated.user;
    reusedExistingAuthUser = true;
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { usuario },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message || 'Não foi possível criar o administrador' }, 400);
    }
    authUser = created.user;
  }

  const { data: legacyProfile, error: profileLookupError } = await admin
    .from('usuarios_sistema')
    .select('id')
    .ilike('usuario', usuario)
    .limit(1)
    .maybeSingle();

  if (profileLookupError) {
    if (!reusedExistingAuthUser) await admin.auth.admin.deleteUser(authUser.id).catch(() => {});
    return json({ error: 'Falha ao localizar o perfil do administrador' }, 500);
  }

  let profileError = null;
  if (legacyProfile?.id) {
    const result = await admin
      .from('usuarios_sistema')
      .update({ auth_user_id: authUser.id, usuario })
      .eq('id', legacyProfile.id);
    profileError = result.error;
  } else {
    const result = await admin
      .from('usuarios_sistema')
      .insert({ auth_user_id: authUser.id, usuario });
    profileError = result.error;
  }

  if (profileError) {
    if (!reusedExistingAuthUser) await admin.auth.admin.deleteUser(authUser.id).catch(() => {});
    return json({
      error: reusedExistingAuthUser
        ? 'A conta Auth existente foi preservada, mas o perfil não pôde ser vinculado'
        : 'O usuário Auth foi revertido porque o perfil não pôde ser vinculado',
    }, 500);
  }

  return json({
    ok: true,
    usuario,
    auth_user_id: authUser.id,
    recovered_existing_auth_user: reusedExistingAuthUser,
  }, reusedExistingAuthUser ? 200 : 201);
});
