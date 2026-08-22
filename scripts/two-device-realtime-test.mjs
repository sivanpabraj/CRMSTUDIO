import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const required = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'E2E_STUDIO_ID',
  'E2E_DEVICE_A_EMAIL', 'E2E_DEVICE_A_PASSWORD',
  'E2E_DEVICE_B_EMAIL', 'E2E_DEVICE_B_PASSWORD'
]
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`)
}

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const studioId = process.env.E2E_STUDIO_ID
const timeoutMs = Number(process.env.E2E_REALTIME_TIMEOUT_MS || 12_000)

const device = label => createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: `erp-realtime-${label}-${randomUUID()}`
  }
})

const a = device('a')
const b = device('b')

async function login(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`login failed: ${error?.message || 'no user'}`)
  return data.user
}

function waitForChange(client, label, filter, predicate) {
  let timer
  let channel
  let markReady
  let failReady
  const ready = new Promise((resolve, reject) => {
    markReady = resolve
    failReady = reject
  })
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    channel = client
      .channel(`erp-two-device-${label}-${randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'erp_work_orders', filter
      }, payload => {
        if (!predicate(payload)) return
        clearTimeout(timer)
        resolve(payload)
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') markReady()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer)
          failReady(new Error(`${label} subscription ${status}`))
          reject(new Error(`${label} subscription ${status}`))
        }
      })
  })
  return { ready, promise, close: async () => { clearTimeout(timer); if (channel) await client.removeChannel(channel) } }
}

const userA = await login(a, process.env.E2E_DEVICE_A_EMAIL, process.env.E2E_DEVICE_A_PASSWORD)
await login(b, process.env.E2E_DEVICE_B_EMAIL, process.env.E2E_DEVICE_B_PASSWORD)

const workOrderId = randomUUID()
const filter = `id=eq.${workOrderId}`
const seenByB = waitForChange(b, 'device-b-insert', filter, p => p.eventType === 'INSERT' && p.new.id === workOrderId)
await seenByB.ready

const { error: insertError } = await a.from('erp_work_orders').insert({
  id: workOrderId,
  studio_id: studioId,
  title: `two-device-${new Date().toISOString()}`,
  status: 'planned',
  version: 1,
  created_by: userA.id
})
if (insertError) throw new Error(`device A insert failed: ${insertError.message}`)
await seenByB.promise
await seenByB.close()

const pulledByB = await b.from('erp_work_orders').select('id,status,version').eq('id', workOrderId).single()
if (pulledByB.error || pulledByB.data.status !== 'planned') {
  throw new Error(`device B could not read device A state: ${pulledByB.error?.message || 'wrong state'}`)
}

const seenByA = waitForChange(a, 'device-a-update', filter, p => p.eventType === 'UPDATE' && p.new.version === 2)
await seenByA.ready
const { error: updateError, count } = await b
  .from('erp_work_orders')
  .update({ status: 'scheduled', version: 2, updated_at: new Date().toISOString() }, { count: 'exact' })
  .eq('id', workOrderId)
  .eq('version', 1)
if (updateError || count !== 1) throw new Error(`device B optimistic update failed: ${updateError?.message || `count=${count}`}`)
await seenByA.promise
await seenByA.close()

const finalAtA = await a.from('erp_work_orders').select('status,version').eq('id', workOrderId).single()
if (finalAtA.error || finalAtA.data.status !== 'scheduled' || finalAtA.data.version !== 2) {
  throw new Error(`device A did not converge: ${finalAtA.error?.message || JSON.stringify(finalAtA.data)}`)
}

await a.from('erp_work_orders')
  .update({ status: 'cancelled', version: 3, updated_at: new Date().toISOString() })
  .eq('id', workOrderId)
  .eq('version', 2)
await Promise.all([a.auth.signOut(), b.auth.signOut()])

console.log(JSON.stringify({
  ok: true,
  workOrderId,
  checks: ['A insert -> B realtime/read', 'B optimistic update -> A realtime/read']
}, null, 2))
