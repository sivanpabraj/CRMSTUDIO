import { createClient } from '@supabase/supabase-js'
import { isAllowedOrigin, readBoundedJson } from '../_shared/request-policy.js'
import { backupAad, decryptBackup, encryptBackup } from '../_shared/backup-crypto.js'
import { assertBackupPayloadSafe } from '../_shared/backup-policy.js'

function response(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

type BackupDeps = {
  createClient: typeof createClient
  env: (name: string) => string | undefined
  backupAad: typeof backupAad
  encryptBackup: typeof encryptBackup
  decryptBackup: typeof decryptBackup
  assertBackupPayloadSafe: typeof assertBackupPayloadSafe
}

export function createCloudBackupHandler(deps: BackupDeps) {
  return async (req: Request) => {
  const requestOrigin = req.headers.get('Origin')
  const allowed = isAllowedOrigin(requestOrigin, deps.env('ALLOWED_ORIGINS') || '')
  const origin = requestOrigin && allowed ? requestOrigin : null
  if (req.method === 'OPTIONS') {
    return allowed
      ? new Response(null, {
          status: 204,
          headers: {
            ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Vary': 'Origin',
          },
        })
      : response({ ok: false, error: 'origin_not_allowed' }, 403, null)
  }
  if (req.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405, origin)
  if (!allowed) return response({ ok: false, error: 'origin_not_allowed' }, 403, null)

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return response({ ok: false, error: 'unauthorized' }, 401, origin)
  const url = deps.env('SUPABASE_URL')
  const anonKey = deps.env('SUPABASE_ANON_KEY')
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY')
  const keyVersion = 1
  const encryptionKey = deps.env(`BACKUP_ENCRYPTION_KEY_V${keyVersion}`)
  if (!url || !anonKey || !serviceKey) {
    return response({ ok: false, error: 'server_not_configured' }, 503, origin)
  }

  try {
    const body = await readBoundedJson(req, 21 * 1024 * 1024)
    const studioId = String(body?.studioId || '')
    const action = String(body?.action || '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studioId)) {
      return response({ ok: false, error: 'invalid_studio_id' }, 400, origin)
    }
    const userClient = deps.createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return response({ ok: false, error: 'unauthorized' }, 401, origin)
    const service = deps.createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (action === 'create') {
      if (!encryptionKey) return response({ ok: false, error: 'server_not_configured' }, 503, origin)
      if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
        return response({ ok: false, error: 'invalid_backup_payload' }, 400, origin)
      }
      deps.assertBackupPayloadSafe(body.payload)
      const schemaVersion = Number(body.schemaVersion)
      if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
        return response({ ok: false, error: 'invalid_schema_version' }, 400, origin)
      }
      const aad = deps.backupAad(studioId, schemaVersion, keyVersion)
      const encrypted = await deps.encryptBackup(body.payload, encryptionKey, aad)
      if (encrypted.plaintextBytes > 20 * 1024 * 1024) {
        return response({ ok: false, error: 'backup_too_large' }, 413, origin)
      }
      const manifest = {
        format: 'crmstudio-aes-gcm-v1',
        schemaVersion,
        appVersion: String(body.appVersion || '').slice(0, 64),
        keyVersion,
        aad,
        algorithm: 'AES-256-GCM',
        createdAt: new Date().toISOString(),
      }
      const { data: backupId, error } = await service.rpc('store_encrypted_studio_backup', {
        p_studio_id: studioId,
        p_actor_id: user.id,
        p_ciphertext: encrypted.ciphertext,
        p_nonce: encrypted.nonce,
        p_checksum: encrypted.checksum,
        p_plaintext_size: encrypted.plaintextBytes,
        p_manifest: manifest,
      })
      if (error) return response({ ok: false, error: 'backup_store_failed' }, /permission|42501/i.test(error.message) ? 403 : 500, origin)
      return response({ ok: true, backupId, manifest }, 201, origin)
    }

    if (action === 'list') {
      const requestedLimit = Number(body?.limit ?? 20)
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        return response({ ok: false, error: 'invalid_backup_limit' }, 400, origin)
      }
      const { data: backups, error } = await service.rpc('list_encrypted_studio_backups', {
        p_studio_id: studioId,
        p_actor_id: user.id,
        p_limit: Math.min(requestedLimit, 100),
      })
      if (error) return response({ ok: false, error: 'backup_list_failed' }, /permission|42501/i.test(error.message) ? 403 : 500, origin)
      return response({ ok: true, backups: Array.isArray(backups) ? backups : [] }, 200, origin)
    }

    if (action === 'restore') {
      const backupId = String(body?.backupId || '')
      const { data: record, error } = await service.rpc('read_encrypted_studio_backup', {
        p_backup_id: backupId,
        p_actor_id: user.id,
      })
      if (error || !record) return response({ ok: false, error: 'backup_read_failed' }, /permission|42501/i.test(error?.message || '') ? 403 : 404, origin)
      const version = Number(record.manifest?.keyVersion)
      const versionKey = deps.env(`BACKUP_ENCRYPTION_KEY_V${version}`)
      if (!versionKey) return response({ ok: false, error: 'backup_key_unavailable' }, 503, origin)
      const payload = await deps.decryptBackup({
        ciphertext: record.ciphertext,
        nonce: record.nonce,
        checksum: record.checksum,
      }, versionKey, record.manifest.aad)
      return response({ ok: true, payload, manifest: record.manifest }, 200, origin)
    }
    return response({ ok: false, error: 'unsupported_action' }, 400, origin)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'request_too_large') return response({ ok: false, error: code }, 413, origin)
    if (code.startsWith('backup_')) return response({ ok: false, error: code }, 422, origin)
    return response({ ok: false, error: 'invalid_request' }, 400, origin)
  }
  }
}

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void }
}
if (runtime.Deno?.serve) {
  runtime.Deno.serve(createCloudBackupHandler({
    createClient,
    env: name => runtime.Deno?.env.get(name),
    backupAad,
    encryptBackup,
    decryptBackup,
    assertBackupPayloadSafe,
  }))
}
