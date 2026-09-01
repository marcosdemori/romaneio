import { createClient } from 'npm:@supabase/supabase-js@2.112.2';
import { authEmailForUsuario, corsHeaders, findAuthUserByEmail, getSupabaseSecretKey, json, normalizeUsername } from '../_shared/auth-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = getSupabaseSecretKey();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Configuracao server-side incompleta' }, 500);

  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Nao autenticado' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const caller = authData?.user;
  if (authError || !caller) return json({ error: 'Sessao invalida' }, 401);

  const { data: callerProfile, error: profileError } = await admin
    .from('usuarios_sistema')
    .select('id, auth_user_id, usuario')
    .eq('auth_user_id', caller.id)
    .maybeSingle();

  if (profileError) return json({ error: 'Falha ao validar perfil do usuario' }, 500);
  if (!callerProfile) return json({ error: 'Usuario autenticado sem perfil vinculado' }, 403);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }
  const action = String(payload.action ?? '');

  if (action === 'list') {
    const { data, error } = await admin
      .from('usuarios_sistema')
      .select('id, auth_user_id, usuario, criado_em')
      .order('usuario');

    if (error) return json({ error: 'Falha ao listar usuarios' }, 500);
    return json({
      users: (data ?? []).map((u) => ({
        id: u.auth_user_id,
        profile_id: u.id,
        usuario: u.usuario,
        criado_em: u.criado_em,
        needs_auth: !u.auth_user_id,
      })),
    });
  }

  if (action === 'create') {
    const usuario = String(payload.usuario ?? '').normalize('NFKC').trim();
    const normalizedUsuario = normalizeUsername(usuario);
    const password = String(payload.password ?? '');
    if (!usuario) return json({ error: 'Informe o usuario' }, 400);
    if (password.length < 8) return json({ error: 'A senha deve ter pelo menos 8 caracteres' }, 400);

    const { data: profiles, error: existingError } = await admin
      .from('usuarios_sistema')
      .select('id, usuario, auth_user_id');

    if (existingError) return json({ error: 'Falha ao verificar usuario existente' }, 500);
    const legacyProfile = (profiles ?? []).find((p) => normalizeUsername(p.usuario) === normalizedUsuario) ?? null;
    if (legacyProfile?.auth_user_id) return json({ error: 'Usuario ja existe' }, 409);

    const email = await authEmailForUsuario(usuario);
    const existingResult = await findAuthUserByEmail(admin, email);
    if (existingResult.error) return json({ error: 'Falha ao verificar conta Auth existente' }, 500);

    let authUser = existingResult.user;
    let reusedExistingAuthUser = false;

    if (authUser) {
      const alreadyLinked = (profiles ?? []).find((p) => p.auth_user_id === authUser.id);
      if (alreadyLinked) return json({ error: 'Usuario ja existe' }, 409);

      const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { ...(authUser.user_metadata ?? {}), usuario },
      });
      if (updateError || !updated.user) {
        return json({ error: updateError?.message || 'Nao foi possivel recuperar a conta Auth existente' }, 400);
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
        return json({ error: createError?.message || 'Nao foi possivel criar o usuario' }, 400);
      }
      authUser = created.user;
    }

    let profile: { id: string; auth_user_id: string; usuario: string } | null = null;
    let saveError = null;
    if (legacyProfile?.id) {
      const result = await admin
        .from('usuarios_sistema')
        .update({ auth_user_id: authUser.id, usuario })
        .eq('id', legacyProfile.id)
        .select('id, auth_user_id, usuario')
        .single();
      profile = result.data;
      saveError = result.error;
    } else {
      const result = await admin
        .from('usuarios_sistema')
        .insert({ auth_user_id: authUser.id, usuario })
        .select('id, auth_user_id, usuario')
        .single();
      profile = result.data;
      saveError = result.error;
    }

    if (saveError || !profile) {
      if (!reusedExistingAuthUser) await admin.auth.admin.deleteUser(authUser.id).catch(() => {});
      return json({
        error: reusedExistingAuthUser
          ? 'A conta Auth existente foi preservada, mas o perfil nao pode ser vinculado'
          : 'O usuario Auth foi revertido porque o perfil nao pode ser vinculado'
      }, 500);
    }

    return json({
      user: { id: profile.auth_user_id, profile_id: profile.id, usuario: profile.usuario },
      migrated_legacy_profile: !!legacyProfile,
      recovered_existing_auth_user: reusedExistingAuthUser,
    }, reusedExistingAuthUser ? 200 : 201);
  }

  if (action === 'delete') {
    const userId = String(payload.user_id ?? '').trim();
    const profileId = String(payload.profile_id ?? '').trim();
    if (!userId && !profileId) return json({ error: 'Identificador do usuario obrigatorio' }, 400);
    if (userId && userId === caller.id) return json({ error: 'Voce nao pode remover seu proprio acesso' }, 409);

    let query = admin.from('usuarios_sistema').select('id, auth_user_id, usuario');
    query = userId ? query.eq('auth_user_id', userId) : query.eq('id', profileId);
    const { data: target, error: targetError } = await query.maybeSingle();

    if (targetError) return json({ error: 'Falha ao localizar usuario' }, 500);
    if (!target) return json({ error: 'Usuario nao encontrado' }, 404);
    if (target.auth_user_id === caller.id) return json({ error: 'Voce nao pode remover seu proprio acesso' }, 409);

    const { count, error: countError } = await admin
      .from('usuarios_sistema')
      .select('id', { count: 'exact', head: true });
    if (countError) return json({ error: 'Falha ao validar quantidade de usuarios' }, 500);
    if ((count ?? 0) <= 1) return json({ error: 'Nao e permitido remover o ultimo usuario' }, 409);

    if (target.auth_user_id) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(target.auth_user_id);
      if (deleteError) return json({ error: deleteError.message }, 400);
      await admin.from('usuarios_sistema').delete().eq('id', target.id);
    } else {
      const { error: deleteProfileError } = await admin.from('usuarios_sistema').delete().eq('id', target.id);
      if (deleteProfileError) return json({ error: 'Falha ao remover perfil legado' }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'Acao invalida' }, 400);
});
