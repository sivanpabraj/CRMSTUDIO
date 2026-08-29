const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function importKey(base64Key) {
  const raw = base64ToBytes(base64Key)
  if (raw.byteLength !== 32) throw new Error('invalid_backup_key')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptBackup(payload, base64Key, aad) {
  const plaintext = encoder.encode(JSON.stringify(payload))
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await importKey(base64Key)
  const additionalData = encoder.encode(aad)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 },
    key,
    plaintext,
  ))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', plaintext))
  return {
    ciphertext: bytesToBase64(encrypted),
    nonce: bytesToBase64(nonce),
    checksum: hex(digest),
    plaintextBytes: plaintext.byteLength,
  }
}

export async function decryptBackup(record, base64Key, aad) {
  const key = await importKey(base64Key)
  let plaintext
  try {
    plaintext = new Uint8Array(await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(record.nonce),
        additionalData: encoder.encode(aad),
        tagLength: 128,
      },
      key,
      base64ToBytes(record.ciphertext),
    ))
  } catch {
    throw new Error('backup_authentication_failed')
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', plaintext))
  if (hex(digest) !== record.checksum) throw new Error('backup_checksum_failed')
  try {
    return JSON.parse(decoder.decode(plaintext))
  } catch {
    throw new Error('backup_payload_invalid')
  }
}

export function backupAad(studioId, schemaVersion, keyVersion) {
  return `CRMSTUDIO|${studioId}|schema:${schemaVersion}|key:${keyVersion}`
}
