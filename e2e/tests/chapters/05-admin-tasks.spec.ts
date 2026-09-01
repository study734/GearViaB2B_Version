import { loginAsAdmin, pause, previewConfiguredAdminTasks, test } from '../../support/live-test';

test('05 · 관리자 업무 조회·정지·삭제·복구 화면', async ({ page }) => {
  await loginAsAdmin(page);
  await previewConfiguredAdminTasks(page);
  await pause(page, 2_500);
});
