import { expect, loginAsUser, openConfiguredGroup, pause, previewGlobalNavigation, previewOfflineStatus, test, visit } from '../../support/live-test';

test('01 · 인증, 개인 대시보드, 프로필과 계정 보안', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login\/?$/);
  await visit(page, '/privacy', '개인정보 처리방침');
  await visit(page, '/terms', '서비스 이용약관');
  await loginAsUser(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '바로가기', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '다가오는 일정', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '그룹별 내 업무', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '미확인 알림', level: 2 })).toBeVisible();
  await previewOfflineStatus(page);
  const group = await openConfiguredGroup(page);
  await previewGlobalNavigation(page, group);
  await pause(page, 2_000);

  await visit(page, '/profile', '프로필');
  await expect(page.getByLabel('닉네임')).toBeVisible();
  await expect(page.getByLabel('전화번호')).toBeVisible();
  await expect(page.getByText('새 프로필 이미지 선택', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await pause(page, 1_500);

  await page.getByRole('link', { name: /계정 및 보안 설정/ }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: '로그인된 기기', level: 2 })).toBeVisible();
  await expect(page.getByLabel('현재 비밀번호')).toBeVisible();
  await expect(page.getByLabel('새 비밀번호')).toBeVisible();
  await expect(page.getByRole('article').getByRole('button', { name: '로그아웃', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '모든 기기에서 로그아웃', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '회원 탈퇴', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: '회원 탈퇴', exact: true })).toBeVisible();
  await pause(page, 2_000);
});
