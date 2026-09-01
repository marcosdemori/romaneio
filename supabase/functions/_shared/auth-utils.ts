export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bootstrap-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function normalizeUsername(value: unknown) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

export async function authEmailForUsuario(usuario: string) {
  const normalized = normalizeUsername(usuario);
  if (!normalized) throw new Error('Usuário inválido');
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `u-${hex}@users.kedpkmpcnpbmeaajfcoq.supabase.co`;
}


export function getSupabaseSecretKey() {
  const current = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (current) {
    try {
      const parsed = JSON.parse(current);
      if (parsed?.default) return String(parsed.default);
    } catch (_) {}
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}
