import { expect, loginAsAdmin, pause, previewConfiguredPendingNotice, test, visitAdminTab } from '../../support/live-test';

test('10 · 조직 브랜딩과 관리자 전체 팀장 공지', async ({ page }) => {
  await loginAsAdmin(page);
  await visitAdminTab(page, '브랜딩', '로고 · 서비스 이름');
  await expect(page.getByLabel('조직/서비스 이름')).toBeVisible();
  await expect(page.getByLabel(/로고 이미지/)).toBeVisible();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeVisible();
  await pause(page, 1_800);

  await previewConfiguredPendingNotice(page);
  await pause(page, 2_500);
});
