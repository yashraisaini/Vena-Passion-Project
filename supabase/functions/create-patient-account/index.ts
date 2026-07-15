import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const ALLOWED_CONDITIONS = ['hemophilia_a', 'hemophilia_b', 'von_willebrand', 'other']

Deno.serve(async (req) => {
  // Browsers preflight cross-origin POSTs with custom headers; Supabase's
  // edge runtime does not add CORS headers for you.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  // These three are auto-injected into every Edge Function's runtime by
  // Supabase -- no manual secret-setting step needed.

  // ---- Caller-scoped client: built ONLY from the forwarded Authorization
  // header + the public anon key. This client is NEVER given the service
  // role key, and is the only thing used to decide who is calling.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  // getUser() round-trips to GoTrue to cryptographically verify the
  // forwarded JWT and return the caller's real identity. This is NOT the
  // same guarantee as verify_jwt (Supabase's platform-level check, on by
  // default): verify_jwt only proves *some* validly-signed JWT was sent --
  // the anon key itself is a validly-signed JWT (role "anon", no `sub`) and
  // passes verify_jwt fine. A caller with no real session still reaches this
  // line, which is why this explicit check exists regardless of verify_jwt.
  const { data: { user }, error: userError } = await callerClient.auth.getUser()
  if (userError || !user) return json({ error: 'Not authenticated' }, 401)

  // Single source of truth for "is this a provider": reuses the exact same
  // public.is_provider() Postgres function every RLS policy in this app
  // already trusts (security definer, bypasses RLS internally), instead of
  // re-implementing a `role === 'provider'` check in TypeScript that could
  // drift from the SQL definition over time.
  const { data: isProvider, error: roleError } = await callerClient.rpc('is_provider')
  if (roleError || !isProvider) return json({ error: 'Only providers can add patients' }, 403)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const email = String(payload?.email ?? '').trim().toLowerCase()
  const first_name = String(payload?.first_name ?? '').trim()
  const last_name = String(payload?.last_name ?? '').trim()
  const condition = payload?.condition || null
  const severity_detail = payload?.severity_detail ? String(payload.severity_detail).trim() : null

  if (!email || !first_name || !last_name) {
    return json({ error: 'email, first_name, and last_name are required' }, 400)
  }
  if (condition && !ALLOWED_CONDITIONS.includes(condition as string)) {
    return json({ error: 'Invalid condition' }, 400)
  }

  // ---- Admin client: the ONLY place the service role key is ever used, and
  // only reachable after the provider check above has already passed. It is
  // a Deno runtime secret -- never sent to, logged for, or derivable by the
  // browser; the only things that ever leave this function are the json(...)
  // responses constructed explicitly below.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)

  if (inviteError || !invited?.user) {
    const msg = (inviteError?.message ?? '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'A user with this email already exists.' }, 409)
    }
    console.error('inviteUserByEmail failed:', inviteError)
    return json({ error: 'Could not create patient account. Please try again.' }, 500)
  }

  // handle_new_user() (003_profiles_and_roles.sql) has already synchronously
  // created a bare profiles row (role='patient', a generated patient_id) as
  // part of the same auth.users insert triggered above -- this update only
  // fills in the fields the provider supplied.
  //
  // Fields are listed explicitly, never spread from the request body: this
  // client bypasses RLS *and* every column grant, so an unreviewed spread
  // here could write literally any column on this table, including `role`.
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ first_name, last_name, condition, severity_detail })
    .eq('id', invited.user.id)

  if (updateError) {
    console.error('post-invite profile update failed:', updateError)
    // Best-effort compensating rollback so a transient failure here doesn't
    // leave a permanently blank, un-owned invited account behind. Can't
    // un-send the invite email already dispatched by inviteUserByEmail, but
    // prevents a dangling half-created account.
    await adminClient.auth.admin.deleteUser(invited.user.id).catch((e) =>
      console.error('rollback deleteUser also failed:', e)
    )
    return json({ error: 'Invite could not be completed. Please try again.' }, 500)
  }

  return json({ id: invited.user.id, email, first_name, last_name, condition, severity_detail }, 200)
})
