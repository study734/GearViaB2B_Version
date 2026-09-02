import {
  allowNasSwitch, expect, loginAsAdmin, mark, pause, test, visitAdminTab,
} from '../support/live-test';

// On-Premise 시연 영상용 단일 관리자 세션.
// 로그인 1회 → 관리자 콘솔 기능을 하나씩 천천히 보여준다. 전환마다 mark 를 찍어
// 자막이 실제 타임스탬프에 붙게 하고, 설정 변경은 결과 화면까지 가볍게 보여준다.
//
// env: loginAsAdmin 과 동일 + E2E_ALLOW_NAS_SWITCH (opt-in) + E2E_MARKS_FILE

const DWELL = 4_500; // 각 화면 체류
const READ = 2_800;  // 짧은 정착

test('On-Premise 관리자 콘솔 시연', async ({ page }) => {
  await loginAsAdmin(page);                 // mark: admin-console
  await pause(page, DWELL);

  // ── 사용자 관리: 등록 폼 → 표 → 수정 모달 ────────────────────────────────
  await visitAdminTab(page, '사용자 관리', '사원 계정 등록');   // mark: tab:사용자 관리
  await pause(page, READ);
  await page.getByLabel('사원 이름').fill('신입 사원');
  await page.getByLabel('회사 메일').fill('newbie@gearvia.example');
  await mark(page, 'user-form');
  await pause(page, DWELL);
  await page.getByLabel('사원 이름').fill('');
  await page.getByLabel('회사 메일').fill('');

  const active = page.getByRole('row').filter({ hasText: '박지우' }).first();
  await active.getByRole('button', { name: '수정', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사용자 정보 수정' })).toBeVisible();
  await mark(page, 'user-edit-modal');
  await pause(page, DWELL);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pause(page, READ);

  // ── 업무 관리: 조직이 모든 팀의 업무를 정지·삭제·복구 ──────────────────
  await visitAdminTab(page, '업무 관리', /^업무$/);              // mark: tab:업무 관리
  await pause(page, DWELL);
  const taskRow = page.getByRole('row').filter({ hasText: '견적 취합' }).first();
  await taskRow.getByRole('button', { name: '정지', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '업무 정지' })).toBeVisible();
  await expect(page.getByLabel('정지 사유')).toBeVisible();
  await mark(page, 'task-suspend-modal');
  await pause(page, DWELL);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pause(page, READ);
  const deleted = page.getByRole('heading', { name: '최근 삭제된 업무', level: 2 });
  await deleted.scrollIntoViewIfNeeded();
  await expect(deleted).toBeVisible();
  await mark(page, 'task-deleted');
  await pause(page, DWELL);

  // ── 추적: 리포트 / 로그인 이력 / 감사 로그 ──────────────────────────────
  await visitAdminTab(page, '리포트', '리포트 다운로드 현황');   // mark: tab:리포트
  await pause(page, DWELL);
  await visitAdminTab(page, '로그인 이력', '로그인 이력');       // mark: tab:로그인 이력
  await pause(page, DWELL);
  await visitAdminTab(page, '감사 로그', '운영 감사로그');       // mark: tab:감사 로그
  await pause(page, DWELL);

  // ── 모니터링 + 스토리지 전환 ─────────────────────────────────────────────
  await visitAdminTab(page, '모니터링', '시스템 사용량');        // mark: tab:모니터링
  await pause(page, DWELL);
  await expect(page.getByRole('heading', { name: '스토리지 연동 설정', level: 2 })).toBeVisible();
  await mark(page, 'monitoring-storage');
  await pause(page, DWELL);
  if (allowNasSwitch()) {
    const method = page.locator('dt', { hasText: /^현재 방식$/ }).locator('xpath=following-sibling::dd[1]');
    await mark(page, 'nas-before');
    await pause(page, READ);
    await page.getByRole('button', { name: 'NAS 연결 테스트 및 전환', exact: true }).click();
    await expect(method).toHaveText(/NAS|사내|nas_mount/i, { timeout: 20_000 });
    await mark(page, 'nas-after');
    await pause(page, DWELL + 1_500);
  }

  // ── AI 사용량 감사: 조직이 AI 호출량·토큰·실패율을 직접 본다 ────────────
  const aiUsage = page.getByRole('heading', { name: 'AI 사용량', level: 2 });
  await aiUsage.scrollIntoViewIfNeeded();
  await expect(aiUsage).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI 호출 세부', level: 2 })).toBeVisible();
  await mark(page, 'ai-usage');
  await pause(page, DWELL);

  // ── AI 정책 ─────────────────────────────────────────────────────────────
  await visitAdminTab(page, 'AI 설정', 'AI 연동 상태');          // mark: tab:AI 설정
  await pause(page, DWELL);

  // ── SMTP: 사내 메일 서버 연동 ───────────────────────────────────────────
  await visitAdminTab(page, 'SMTP 설정', 'SMTP 설정');           // mark: tab:SMTP 설정
  await pause(page, DWELL);

  // ── 브랜딩: 이름 + 로고 이미지 변경 → 저장 → 서비스 화면 반영 확인 ──────
  await visitAdminTab(page, '브랜딩', '로고 · 서비스 이름');      // mark: tab:브랜딩
  await pause(page, READ);
  const nameField = page.getByLabel('조직/서비스 이름');
  await mark(page, 'brand-before');
  await pause(page, 1_500);
  const NEW_BRAND = '가온웍스 협업';
  await nameField.fill(NEW_BRAND);
  await pause(page, 900);
  await page.getByLabel(/로고 이미지/).setInputFiles('video/assets/demo-logo.png');
  await mark(page, 'brand-logo');
  await pause(page, DWELL);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText(/저장했습니다|저장|반영|완료/).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
  await mark(page, 'brand-saved');
  await pause(page, DWELL);
  // 결과: 서비스 홈 네비게이션에 새 이름 + 새 로고가 반영됨
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation').getByText(NEW_BRAND).first()).toBeVisible({ timeout: 10_000 });
  await mark(page, 'brand-applied');
  await pause(page, DWELL + 800);
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Admin$/, level: 1 })).toBeVisible();

  // ── 공지 ────────────────────────────────────────────────────────────────
  await visitAdminTab(page, '공지 발송', '전체 팀장 공지');       // mark: tab:공지 발송
  await pause(page, DWELL);
  await mark(page, 'end');
});
