import { resolve4, resolve6 } from 'node:dns/promises'
import { connect } from 'node:tls'

const appUrl = new URL(process.env.DEPLOYMENT_APP_URL || '')
if (appUrl.protocol !== 'https:') throw new Error('network preflight requires an HTTPS deployment URL')

const addresses = [...await resolve4(appUrl.hostname).catch(() => []), ...await resolve6(appUrl.hostname).catch(() => [])]
if (!addresses.length) throw new Error(`DNS did not resolve ${appUrl.hostname}`)

const expected = String(process.env.EXPECTED_DEPLOYMENT_IPS || '').split(',').map(value => value.trim()).filter(Boolean)
if (expected.length && !addresses.some(address => expected.includes(address))) {
  throw new Error(`DNS addresses ${addresses.join(',')} do not match the deployment allowlist`)
}

const tlsInfo = await new Promise((resolve, reject) => {
  const socket = connect({
    host: appUrl.hostname,
    port: Number(appUrl.port || 443),
    servername: appUrl.hostname,
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    timeout: 15_000
  })
  socket.once('secureConnect', () => {
    const certificate = socket.getPeerCertificate()
    const result = { protocol: socket.getProtocol(), validTo: certificate.valid_to }
    socket.end()
    resolve(result)
  })
  socket.once('timeout', () => socket.destroy(new Error('TLS handshake timed out')))
  socket.once('error', reject)
})

const expiresAt = Date.parse(tlsInfo.validTo || '')
const remainingDays = Math.floor((expiresAt - Date.now()) / 86_400_000)
if (!Number.isFinite(expiresAt) || remainingDays < 14) {
  throw new Error(`TLS certificate expires too soon (${remainingDays} days)`)
}

const plain = new URL(appUrl)
plain.protocol = 'http:'
plain.port = ''
const redirect = await fetch(plain, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
const location = redirect.headers.get('location') || ''
if (![301, 308].includes(redirect.status) || !location.startsWith('https://')) {
  throw new Error(`HTTP does not redirect to HTTPS (${redirect.status}, ${location || 'no location'})`)
}

console.log(JSON.stringify({ hostname: appUrl.hostname, addresses, tls: tlsInfo.protocol, certificateRemainingDays: remainingDays }))
