import { expect, loginAsAdmin, pause, test, visitAdminTab } from '../../support/live-test';

test('08 · CPU·메모리·파일시스템과 AI 사용량 모니터링', async ({ page }) => {
  await loginAsAdmin(page);
  await visitAdminTab(page, '모니터링', '시스템 사용량');
  await expect(page.getByRole('heading', { name: '시스템 사용량', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 사용량', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 호출 세부', level: 2 })).toBeVisible();
  await expect(page.getByText('CPU', { exact: true })).toBeVisible();
  await expect(page.getByText('메모리', { exact: true })).toBeVisible();
  await expect(page.getByText('저장소', { exact: true })).toBeVisible();
  await pause(page, 2_500);
});
