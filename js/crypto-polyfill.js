/* ═══════════════════════════════════════════════════════════════
   CRMSTUDIO — Web Crypto API Polyfill (Insecure Context Fallback)
   Allows crypto.subtle (SHA-256, HMAC, PBKDF2) to work on HTTP / IP
   ═══════════════════════════════════════════════════════════════ */
(function() {
  if (typeof window === "undefined") return;
  if (!window.crypto) window.crypto = {};

  if (!window.crypto.getRandomValues) {
    window.crypto.getRandomValues = function(arr) {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    };
  }

  if (!window.crypto.subtle) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function sha256(bytes) {
      let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
      const l = bytes.length;
      const bitLen = l * 8;
      const padLen = ((l + 9 + 63) >> 6) << 6;
      const msg = new Uint8Array(padLen);
      msg.set(bytes);
      msg[l] = 0x80;
      const view = new DataView(msg.buffer);
      view.setUint32(padLen - 4, bitLen >>> 0);
      view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
      const W = new Int32Array(64);
      const rotr = (x, n) => (x >>> n) | (x << (32 - n));
      for (let i = 0; i < padLen; i += 64) {
        for (let t = 0; t < 16; t++) W[t] = view.getInt32(i + t * 4);
        for (let t = 16; t < 64; t++) {
          const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
          const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
          W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
          const ch = (e & f) ^ ((~e) & g);
          const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
          const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const temp2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + temp1) | 0;
          d = c; c = b; b = a; a = (temp1 + temp2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      const out = new Uint8Array(32);
      const outView = new DataView(out.buffer);
      for (let t = 0; t < 8; t++) outView.setInt32(t * 4, H[t]);
      return out;
    }

    function hmac(keyBytes, msgBytes) {
      let k = keyBytes;
      if (k.length > 64) k = sha256(k);
      const paddedKey = new Uint8Array(64);
      paddedKey.set(k);
      const iPad = new Uint8Array(64);
      const oPad = new Uint8Array(64);
      for (let i = 0; i < 64; i++) {
        iPad[i] = paddedKey[i] ^ 0x36;
        oPad[i] = paddedKey[i] ^ 0x5c;
      }
      const innerMsg = new Uint8Array(64 + msgBytes.length);
      innerMsg.set(iPad);
      innerMsg.set(msgBytes, 64);
      const innerHash = sha256(innerMsg);
      const outerMsg = new Uint8Array(64 + 32);
      outerMsg.set(oPad);
      outerMsg.set(innerHash, 64);
      return sha256(outerMsg);
    }

    function pbkdf2(passBytes, saltBytes, iter, keyLenBytes = 32) {
      const numBlocks = Math.ceil(keyLenBytes / 32);
      const result = new Uint8Array(numBlocks * 32);
      for (let block = 1; block <= numBlocks; block++) {
        const saltBlock = new Uint8Array(saltBytes.length + 4);
        saltBlock.set(saltBytes);
        const view = new DataView(saltBlock.buffer);
        view.setUint32(saltBytes.length, block);
        let u = hmac(passBytes, saltBlock);
        const t = new Uint8Array(u);
        for (let c = 1; c < iter; c++) {
          u = hmac(passBytes, u);
          for (let j = 0; j < 32; j++) t[j] ^= u[j];
        }
        result.set(t, (block - 1) * 32);
      }
      return result.slice(0, keyLenBytes);
    }

    window.crypto.subtle = {
      importKey: async function(_format, keyData, algo, _extractable, _keyUsages) {
        const raw = keyData instanceof Uint8Array ? keyData : new Uint8Array(keyData);
        return { _raw: raw, _algo: algo };
      },
      deriveBits: async function(algo, keyMaterial, length) {
        let iter = algo.iterations || 10000;
        if (iter > 10000) iter = 10000;
        const salt = algo.salt instanceof Uint8Array ? algo.salt : new Uint8Array(algo.salt);
        const pass = keyMaterial._raw;
        const lenBytes = Math.ceil((length || 256) / 8);
        const res = pbkdf2(pass, salt, iter, lenBytes);
        return res.buffer;
      },
      digest: async function(algo, data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        return sha256(bytes).buffer;
      },
      sign: async function(algo, key, data) {
        const k = key._raw instanceof Uint8Array ? key._raw : new Uint8Array(key._raw);
        const d = data instanceof Uint8Array ? data : new Uint8Array(data);
        return hmac(k, d).buffer;
      }
    };
    console.info("[CRMSTUDIO] Fallback WebCrypto subtle initialized for insecure/HTTP context.");
  }
})();
