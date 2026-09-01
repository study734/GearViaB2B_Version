import { loginAsAdmin, pause, previewAdminOverview, previewConfiguredAdminMfaSetup, previewConfiguredAdminUsers, resetClientSession, test } from '../../support/live-test';

test('04 · 관리자 사용자 생성·수정·정지·삭제·비밀번호 재설정 화면', async ({ page }) => {
  if (await previewConfiguredAdminMfaSetup(page)) await resetClientSession(page);
  await loginAsAdmin(page);
  await previewAdminOverview(page);
  await previewConfiguredAdminUsers(page);
  await pause(page, 2_500);
});
