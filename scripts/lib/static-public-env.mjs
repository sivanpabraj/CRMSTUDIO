const PUBLIC_ENV_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

function jwtRole(key) {
  try {
    const payload = String(key || '').split('.')[1]
    if (!payload) return ''
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role || ''
  } catch {
    return ''
  }
}

export function assertPublishableSupabaseKey(key) {
  const value = String(key || '').trim()
  if (!value) return
  if (/^(?:sb_secret_|sb_service_role_)/i.test(value) || jwtRole(value) === 'service_role') {
    throw new Error('VITE_SUPABASE_ANON_KEY must be a publishable/anon key, never a secret/service_role key')
  }
  if (!value.startsWith('sb_publishable_') && jwtRole(value) !== 'anon') {
    throw new Error('VITE_SUPABASE_ANON_KEY is not a recognized publishable/anon key')
  }
}

export function assertProductionSupabaseConfig(env = process.env) {
  if (String(env.E2E_LOCAL_DEMO_BUILD || '').trim() === '1') return
  const url = String(env.VITE_SUPABASE_URL || '').trim()
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    throw new Error('production build requires a valid VITE_SUPABASE_URL')
  }
  if (!key) throw new Error('production build requires VITE_SUPABASE_ANON_KEY')
  assertPublishableSupabaseKey(key)
}

export function injectStaticPublicEnv(source, env = process.env) {
  assertPublishableSupabaseKey(env.VITE_SUPABASE_ANON_KEY)
  let output = String(source)
  for (const name of PUBLIC_ENV_NAMES) {
    output = output.split(`import.meta.env?.${name}`).join(JSON.stringify(String(env[name] || '').trim()))
  }
  return output
}

export function renderStaticBuildFlags(env = process.env) {
  const localDemo = String(env.E2E_LOCAL_DEMO_BUILD || '').trim() === '1'
  return `/* Generated build flags; never derive these from browser-controlled state. */\n` +
    `globalThis.__SM_BUILD_FLAGS__ = Object.freeze(${JSON.stringify({ localDemo })})\n`
}
