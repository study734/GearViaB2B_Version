import { allowNasSwitch, expect, loginAsAdmin, pause, test, visitAdminTab } from '../../support/live-test';

test('07 · 파일 스토리지 로컬·NAS 연동 제어 화면', async ({ page }) => {
  await loginAsAdmin(page);
  await visitAdminTab(page, '모니터링', '시스템 사용량');
  await expect(page.getByRole('heading', { name: '스토리지 연동 설정', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'NAS 연결 테스트 및 전환', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '로컬로 되돌리기', exact: true })).toBeVisible();
  await expect(page.getByText(/현재 방식/)).toBeVisible();
  await expect(page.getByText(/NAS 경로/)).toBeVisible();
  await pause(page, 2_500);

  // Opt-in only: run the real local -> nas_mount switch on a disposable
  // recording VM. Default keeps this a preview like every other admin action.
  if (allowNasSwitch()) {
    await page.getByRole('button', { name: 'NAS 연결 테스트 및 전환', exact: true }).click();
    await expect(page.getByText(/현재 방식[\s\S]*NAS|NAS[\s\S]*사내 스토리지/)).toBeVisible({ timeout: 20_000 });
    await pause(page, 3_000);
  }
});
