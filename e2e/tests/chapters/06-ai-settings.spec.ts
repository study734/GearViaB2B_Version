import { allowAiCalls, expect, loginAsAdmin, pause, test, visitAdminTab } from '../../support/live-test';

test('06 · 관리자 AI API 연결·활성화 정책·모델 표시', async ({ page }) => {
  await loginAsAdmin(page);
  await visitAdminTab(page, 'AI 설정', 'AI 연동 상태');
  await expect(page.getByRole('heading', { name: 'AI 설정 변경', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: '연결 테스트', exact: true })).toBeVisible();
  await expect(page.getByLabel('API 키')).toBeVisible();
  await expect(page.getByLabel('키 삭제')).toBeVisible();
  await expect(page.getByLabel('AI 비서 활성화')).toBeVisible();
  await expect(page.getByLabel('AI 주간 리포트 활성화')).toBeVisible();
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeVisible();

  if (allowAiCalls()) {
    await page.getByRole('button', { name: '연결 테스트', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'AI 비서', level: 3 })).toBeVisible();
  }
  await pause(page, 2_500);
});
