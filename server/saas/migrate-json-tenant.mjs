#!/usr/bin/env node
/**
 * ستون ۸ — مهاجرت یک فایل tenant JSON به Postgres
 *Usage:
 *  DATABASE_URL=postgres://... node server/saas/migrate-json-tenant.mjs /var/lib/crmstudio/tenants/xxx.json
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
  try {
    await client.query('BEGIN')
    const info = data.studioInfo || {}
    const slug =
      path.basename(file, '.json').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) ||
      'studio_' + crypto.randomBytes(4).toString('hex')

    const st = await client.query(
      `INSERT INTO studios (slug, name, phone, email, settings)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      [
        slug,
        info.name || 'استودیو',
        phone(info.phone || info.managerPhone),
        info.email || null,
        JSON.stringify(info)
      ]
    )
    const studioId = st.rows[0].id
    console.log('studio', studioId, slug)

    const users = Array.isArray(data.users) ? data.users : []
    for (const u of users) {
      const p = phone(u.phone)
      if (!p && !u.email) continue
      const ur = await client.query(
        `INSERT INTO users (phone, email, password_hash, password_salt, name, status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (phone) DO UPDATE SET name = COALESCE(EXCLUDED.name, users.name)
         RETURNING id`,
        [
          p,
          u.email || null,
          u.password || null,
          u.salt || null,
          u.name || 'کاربر',
          u.status || 'active'
        ]
      )
      const role =
        (u.roles || []).includes('studio_manager') || (u.roles || []).includes('system_admin')
          ? 'studio_manager'
          : 'staff'
      await client.query(
        `INSERT INTO memberships (user_id, studio_id, role, roles, status)
         VALUES ($1,$2,$3,$4::jsonb,'active')
         ON CONFLICT (user_id, studio_id) DO NOTHING`,
        [ur.rows[0].id, studioId, role, JSON.stringify(u.roles || [role])]
      )
    }

    const contracts = Array.isArray(data.contracts) ? data.contracts : []
    let n = 0
    for (const c of contracts) {
      await client.query(
        `INSERT INTO contracts (studio_id, contract_num, bride, groom, couple, phone, bride_phone, groom_phone, event_date, total_price, paid_amount, status, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
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
      n++
    }
    console.log('contracts imported', n)

    await client.query('COMMIT')
    console.log('✓ done')
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
