import { writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { assertLiveRecording, expect, loginAsAdmin, mark, pause, requiredEnv, test } from '../../support/live-test';

// 처음 설치한 관리자의 first-run 온보딩을 그대로 녹화한다:
//   admin/admin 첫 로그인 → 비밀번호 변경 강제 → MFA 등록(QR) → 관리자 콘솔 진입.
//
// 폐기용 촬영 VM 전용. 다음 env 필요:
//   E2E_ADMIN_USER=admin
//   E2E_ADMIN_INITIAL_PASSWORD=admin
//   E2E_ADMIN_NEW_PASSWORD=<새 비밀번호>
// 등록된 MFA secret 은 output/assemble/onboarding-mfa-secret.txt 에 기록되어
// 이후 chapter 녹화·데이터 시드에서 재사용된다.
// QR·secret 화면은 편집(assemble)에서 블러 처리한다.

function totp(base32: string): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let bits = 0, val = 0;
  for (const c of base32.toUpperCase()) {
    const i = A.indexOf(c);
    if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

test('00 · 최초 설치 관리자 온보딩 (비밀번호 변경 · MFA 등록)', async ({ page }) => {
  assertLiveRecording();
  const id = requiredEnv('E2E_ADMIN_USER');
  const initial = requiredEnv('E2E_ADMIN_INITIAL_PASSWORD');
  const next = requiredEnv('E2E_ADMIN_NEW_PASSWORD');

  // 1. 최초 로그인 (admin / admin)
  await page.goto('/login?next=/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
  await mark(page, 'first-login');
  await pause(page, 2_500);
  await page.getByLabel('회사 메일 또는 관리자 ID').fill(id);
  await page.getByLabel('비밀번호').fill(initial);
  await page.getByRole('button', { name: '로그인', exact: true }).click();

  // 2. 비밀번호 변경 강제 화면
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: '계정 설정', level: 1 })).toBeVisible();
  await mark(page, 'pw-change');
  await pause(page, 3_500);
  await page.getByLabel('현재 비밀번호', { exact: true }).fill(initial);
  await page.getByLabel('새 비밀번호', { exact: true }).fill(next);
  await pause(page, 1_200);
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await pause(page, 1_800);

  // 3. 새 비밀번호로 재로그인 → /admin 진입 시 MFA 미설정이므로 MFA 등록 화면
  await page.goto('/login?next=/admin', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('회사 메일 또는 관리자 ID').fill(id);
  await page.getByLabel('비밀번호').fill(next);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  if (!/\/admin/.test(page.url())) await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '관리자 MFA 설정', level: 1 })).toBeVisible();
  await mark(page, 'mfa-setup');
  await pause(page, 3_500);

  // 4. MFA 등록 (QR + 수동 secret — 편집에서 블러)
  await page.getByRole('button', { name: 'MFA 설정 시작', exact: true }).click();
  await expect(page.getByRole('img', { name: 'MFA 설정 QR 코드' })).toBeVisible();
  await mark(page, 'mfa-qr');
  await pause(page, 2_000);
  // 수동 등록 펼쳐서 Base32 secret 확인 (블러 대상)
  await page.getByText('QR 스캔이 어려운 경우 수동 등록', { exact: true }).click();
  await pause(page, 2_000);

  const bodyText = await page.locator('main').innerText();
  const secret = (bodyText.replace(/\s+/g, '').match(/[A-Z2-7]{16,64}/) || [])[0];
  if (!secret) throw new Error('MFA 설정 화면에서 secret 을 찾지 못했습니다.');
  writeFileSync('output/assemble/onboarding-mfa-secret.txt', secret, 'utf8');

  await mark(page, 'mfa-secret-shown');
  await pause(page, 2_500);
  await page.getByLabel('6자리 인증 코드').fill(totp(secret));
  await pause(page, 900);
  await page.getByRole('button', { name: '확인하고 활성화', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await mark(page, 'mfa-done');
  await pause(page, 2_000);

  // 5. 비밀번호 + MFA 코드로 최종 로그인 → 관리자 콘솔 (검증된 loginAsAdmin 재사용)
  process.env.E2E_ADMIN_PASSWORD = next;
  process.env.E2E_ADMIN_MFA_SECRET = secret;
  await loginAsAdmin(page);
  await pause(page, 2_500);
});
