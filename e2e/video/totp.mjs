#!/usr/bin/env node
// 현재 TOTP 6자리를 출력한다 (RFC 6238, SHA1, 30s, 6digit — 앱 TotpService 와 동일).
// 폐기 촬영 VM 의 관리자 MFA 코드를 chapter 녹화 직전에 계산하는 용도.
//
//   node video/totp.mjs <BASE32_SECRET>
//   E2E_ADMIN_MFA_SECRET=... node video/totp.mjs
//
// 예: E2E_ADMIN_MFA_CODE=$(node video/totp.mjs) npm run record:chapter -- ...

import { createHmac } from 'node:crypto';

const secret = (process.argv[2] || process.env.E2E_ADMIN_MFA_SECRET || '').trim().toUpperCase().replace(/=+$/, '');
if (!secret) { console.error('secret 없음: node video/totp.mjs <BASE32> 또는 E2E_ADMIN_MFA_SECRET'); process.exit(1); }

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of s) {
    const idx = A.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totp(base32, atMs = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(atMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const h = createHmac('sha1', b32decode(base32)).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') || process.argv[1]?.endsWith('totp.mjs')) {
  process.stdout.write(totp(secret));
}
