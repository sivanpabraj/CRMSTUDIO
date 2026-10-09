#!/usr/bin/env node
/**
 * مهاجرت کامل tenant JSON → Postgres (فاز B/C)
 * DATABASE_URL=... node server/saas/migrate-json-tenant.mjs /path/to/tenant.json
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import crypto from 'node:crypto'

const file = process.argv[2]
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node migrate-json-tenant.mjs <tenant.json>')
  process.exit(1)
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL required')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const pool = new pg.Pool({ connectionString: DATABASE_URL })

function phone(p) {
  if (!p) return null
  let en = String(p).replace(/\D/g, '')
  if (en.startsWith('98') && en.length === 12) en = '0' + en.slice(2)
  if (en.length === 10 && en.startsWith('9')) en = '0' + en
  return en || null
}

async function main() {
  const client = await pool.connect()
  const stats = { users: 0, contracts: 0, banks: 0, tx: 0, personnel: 0, afish: 0 }
  try {
    await client.query('BEGIN')
    const info = data.studioInfo || {}
    const slug =
      path.basename(file, '.json').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) ||
      'studio_' + crypto.randomBytes(4).toString('hex')

    const st = await client.query(
      `INSERT INTO studios (slug, name, phone, email, settings)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, settings = EXCLUDED.settings, updated_at = now()
       RETURNING id`,
      [slug, info.name || 'استودیو', phone(info.phone || info.managerPhone), info.email || null, JSON.stringify(info)]
    )
    const studioId = st.rows[0].id
    console.log('studio', studioId, slug)

    const userIdByPhone = new Map()
    for (const u of data.users || []) {
      const p = phone(u.phone)
      if (!p && !u.email) continue
      const ur = await client.query(
        `INSERT INTO users (phone, email, password_hash, password_salt, name, status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name),
           password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
           password_salt = COALESCE(EXCLUDED.password_salt, users.password_salt)
         RETURNING id`,
        [p, u.email || null, u.password || null, u.salt || null, u.name || 'کاربر', u.status || 'active']
      )
      const uid = ur.rows[0].id
      if (p) userIdByPhone.set(p, uid)
      const role =
        (u.roles || []).includes('studio_manager') || (u.roles || []).includes('system_admin')
          ? 'studio_manager'
          : 'staff'
      await client.query(
        `INSERT INTO memberships (user_id, studio_id, role, roles, status)
         VALUES ($1,$2,$3,$4::jsonb,'active') ON CONFLICT (user_id, studio_id) DO NOTHING`,
        [uid, studioId, role, JSON.stringify(u.roles || [role])]
      )
      stats.users++
    }

    const contractIdMap = new Map()
    for (const c of data.contracts || []) {
      const r = await client.query(
        `INSERT INTO contracts (studio_id, contract_num, bride, groom, couple, phone, bride_phone, groom_phone, event_date, total_price, paid_amount, status, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          studioId,
          c.contractNum || null,
          c.bride || null,
          c.groom || null,
          c.couple || null,
          phone(c.phone || c.groomPhone),
          phone(c.bridePhone),
          phone(c.groomPhone),
          c.eventDate || c.date || null,
          Number(c.totalPrice || c.price || 0),
          Number(c.paidAmount || c.paid || c.prepayment || 0),
          c.status || 'active',
          JSON.stringify(c)
        ]
      )
      if (c.id) contractIdMap.set(String(c.id), r.rows[0].id)
      stats.contracts++
    }

    const bankIdMap = new Map()
    for (const b of data.banks || []) {
      const r = await client.query(
        `INSERT INTO banks (studio_id, name, bank_name, account, card, iban, balance, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          studioId,
          b.name || null,
          b.bank || b.bankName || null,
          b.account || null,
          b.card || null,
          b.iban || null,
          Number(b.balance || 0),
          JSON.stringify(b)
        ]
      )
      if (b.id) bankIdMap.set(String(b.id), r.rows[0].id)
      stats.banks++
    }

    for (const t of data.transactions || []) {
      const type = t.type === 'withdrawal' || t.type === 'out' ? 'withdrawal' : 'deposit'
      await client.query(
        `INSERT INTO transactions (studio_id, type, amount, date_jalali, bank_id, contract_id, purpose_category, purpose, client_name, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          studioId,
          type,
          Math.abs(Number(t.amount || 0)),
          t.date || null,
          bankIdMap.get(String(t.bankId || '')) || null,
          contractIdMap.get(String(t.contractId || '')) || null,
          t.purposeCategory || t.category || null,
          t.purpose || t.desc || t.notes || null,
          t.client || null,
          JSON.stringify(t)
        ]
      )
      stats.tx++
    }

    const personnelIdMap = new Map()
    for (const p of data.personnel || []) {
      const roles = Array.isArray(p.roles) ? p.roles : p.role ? [p.role] : []
      const r = await client.query(
        `INSERT INTO personnel (studio_id, user_id, name, phone, roles, status, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id`,
        [
          studioId,
          userIdByPhone.get(phone(p.phone) || '') || null,
          p.name || 'همکار',
          phone(p.phone),
          JSON.stringify(roles),
          p.status || 'active',
          JSON.stringify(p)
        ]
      )
      if (p.id) personnelIdMap.set(String(p.id), r.rows[0].id)
      stats.personnel++
    }

    for (const a of data.persProjects || data.afish || []) {
      await client.query(
        `INSERT INTO pers_projects (studio_id, contract_id, personnel_id, role_id, accepted, payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          studioId,
          contractIdMap.get(String(a.contractId || a.contract_id || '')) || null,
          personnelIdMap.get(String(a.personnelId || a.personnel_id || '')) || null,
          a.roleId || a.role || null,
          Boolean(a.accepted),
          JSON.stringify(a)
        ]
      )
      stats.afish++
    }

    await client.query('COMMIT')
    console.log('✓ migrate complete', stats)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
