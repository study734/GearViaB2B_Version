import { expect, loginAsAdmin, pause, test, visitAdminTab } from '../../support/live-test';

test('09 · 리포트 추적·로그인 이력·감사 로그', async ({ page }) => {
  await loginAsAdmin(page);
  await visitAdminTab(page, '리포트', '리포트 다운로드 현황');
  await expect(page.getByRole('heading', { name: '예약 리포트 발송 현황', level: 2 })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(2);
  await pause(page, 1_800);

  await visitAdminTab(page, '로그인 이력', '로그인 이력');
  await expect(page.getByRole('table')).toBeVisible();
  await pause(page, 1_500);
  await visitAdminTab(page, '감사 로그', '운영 감사로그');
  await expect(page.getByRole('table')).toBeVisible();
  await pause(page, 2_500);
});
