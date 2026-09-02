import { createHmac } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

export { expect, test };

// ── 촬영 mark ────────────────────────────────────────────────────────────────
// 화면 전환 시점을 파일에 기록해 자막(build-captions)이 실제 타임스탬프에 붙게 한다.
// E2E_MARKS_FILE 이 지정된 녹화에서만 동작. markStart() 는 녹화 시작 직후 호출.
let markT0 = 0;
// 녹화 프로세스당 한 번만 T0 를 고정한다. (assertLiveRecording 이 loginAsAdmin 등에서
// 여러 번 호출되므로 매번 재설정하면 mark 시각이 틀어진다.)
export function markStart() { if (!markT0) markT0 = Date.now(); }
export async function mark(page: Page, label: string) {
  const file = process.env.E2E_MARKS_FILE?.trim();
  if (file) {
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${label}\t${((Date.now() - markT0) / 1000).toFixed(2)}\n`);
    } catch { /* noop */ }
  }
}

export type GroupRef = {
  id: number;
  name: string;
  dashboardPath: string;
  tasksPath: string;
  projectsPath: string;
  membersPath: string;
  filesPath: string;
  chatPath: string;
  settingsPath: string;
};

export type TaskRef = { id: number; title: string; path: string };
export type ProjectRef = { id: number; name: string; path: string };
export type ChannelRef = { name: string };

export function pauseMs(defaultValue = 1_000) {
  const configured = Number(process.env.E2E_PAUSE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : defaultValue;
}

export async function pause(page: Page, milliseconds = pauseMs()) {
  await page.waitForTimeout(milliseconds);
}

export async function isVisible(locator: Locator) {
  return await locator.count() > 0 && await locator.first().isVisible().catch(() => false);
}

export async function clickIfVisible(locator: Locator) {
  if (!await isVisible(locator)) return false;
  await locator.first().click();
  return true;
}

export async function firstVisible(locator: Locator): Promise<Locator | undefined> {
  for (const candidate of await locator.all()) {
    if (await isVisible(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Opens a UI modal and dismisses it with Escape. This deliberately exercises
 * the form without submitting a write to the live environment.
 */
export async function closeModal(page: Page) {
  const dialog = page.getByRole('dialog');
  if (await dialog.count() === 0) return;
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await pause(page, pauseMs(500));
}

export function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function allowReadOnlyActions() {
  return process.env.E2E_ALLOW_READONLY_ACTIONS === 'true';
}

export function allowAiCalls() {
  return process.env.E2E_ALLOW_AI_CALLS === 'true';
}

export function allowRagReindex() {
  return process.env.E2E_ALLOW_RAG_REINDEX === 'true';
}

/**
 * Opt-in for the real storage provider switch (local -> nas_mount) shown in the
 * On-Premise showcase video. Off by default so chapter 07 only previews the
 * controls. Enable ONLY on a disposable recording VM, never a shared or
 * production-like environment. See ONPREM_VIDEO_PLAN.md and COVERAGE.md.
 */
export function allowNasSwitch() {
  return process.env.E2E_ALLOW_NAS_SWITCH === 'true';
}

export async function visit(page: Page, path: string, heading?: string | RegExp, level: 1 | 2 = 1) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const target = heading
    ? page.getByRole('heading', { name: heading, level })
    : page.getByRole('heading', { level }).first();
  await expect(target).toBeVisible();
  await pause(page);
}

export async function loginAsUser(page: Page) {
  assertLiveRecording();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
  await pause(page);
  const identifier = requiredEnv('E2E_USER');
  const password = requiredEnv('E2E_PASSWORD');
  await page.getByLabel('회사 메일 또는 관리자 ID').fill(identifier);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:app|account)$/);
  if (/\/account$/.test(page.url())) {
    await completeInitialPasswordChange(page, password, requiredEnv('E2E_USER_NEW_PASSWORD'));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
    await page.getByLabel('회사 메일 또는 관리자 ID').fill(identifier);
    await page.getByLabel('비밀번호').fill(requiredEnv('E2E_USER_NEW_PASSWORD'));
    await page.getByRole('button', { name: '로그인', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: '바로가기', level: 2 })).toBeVisible();
  await pause(page, pauseMs(1_500));
}

export async function loginAsAdmin(page: Page) {
  assertLiveRecording();
  await page.goto('/login?next=/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
  const identifier = requiredEnv('E2E_ADMIN_USER');
  const password = requiredEnv('E2E_ADMIN_PASSWORD');
  await page.getByLabel('회사 메일 또는 관리자 ID').fill(identifier);
  await page.getByLabel('비밀번호').fill(password);
  const mfa = page.getByLabel('관리자 MFA 코드');
  const mfaConfigured = Boolean(process.env.E2E_ADMIN_MFA_CODE?.trim() || process.env.E2E_ADMIN_MFA_SECRET?.trim());
  const loginButton = page.getByRole('button', { name: '로그인', exact: true });

  const mfaVisibleNow = async () => await mfa.count() > 0 && await mfa.isVisible().catch(() => false);
  let mfaWasVisible = await mfaVisibleNow();
  if (mfaWasVisible) await mfa.fill(adminMfaCode());
  await loginButton.click();

  if (/\/account$/.test(page.url())) {
    await completeInitialPasswordChange(page, password, requiredEnv('E2E_ADMIN_NEW_PASSWORD'));
    await page.goto('/login?next=/admin', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
    await page.getByLabel('회사 메일 또는 관리자 ID').fill(identifier);
    await page.getByLabel('비밀번호').fill(requiredEnv('E2E_ADMIN_NEW_PASSWORD'));
    await loginButton.click();
  }

  // MFA 는 보통 1차 로그인이 ADMIN_MFA_REQUIRED 로 거절된 뒤에야 필드가 나타난다.
  if (!mfaWasVisible && mfaConfigured) {
    await mfa.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  }
  if (!mfaWasVisible && await mfaVisibleNow()) {
    await mfa.fill(adminMfaCode());
    await loginButton.click();
  }
  await expect(page).toHaveURL(/\/admin(?:\/|$)/);
  await expect(page.getByRole('heading', { name: /Admin$/, level: 1 })).toBeVisible();
  await mark(page, 'admin-console');
  await pause(page, pauseMs(1_500));
}

/**
 * Optionally records the real first-time MFA setup screen using a separate,
 * disposable non-production administrator. Enabling MFA is a persistent
 * security change, so this path is opt-in and never uses the main admin
 * account by accident.
 */
export async function previewConfiguredAdminMfaSetup(page: Page) {
  const identifier = envValue('E2E_ADMIN_SETUP_USER');
  if (!identifier) return false;
  if (process.env.E2E_ALLOW_ADMIN_MFA_SETUP !== 'true') {
    throw new Error('E2E_ADMIN_SETUP_USER is set, but MFA setup is disabled. Set E2E_ALLOW_ADMIN_MFA_SETUP=true only for a disposable non-production admin account.');
  }
  assertLiveRecording();
  const password = requiredEnv('E2E_ADMIN_SETUP_PASSWORD');
  const setupCode = requiredEnv('E2E_ADMIN_SETUP_MFA_CODE');
  await page.goto('/login?next=/admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
  await page.getByLabel('회사 메일 또는 관리자 ID').fill(identifier);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  if (/\/account$/.test(page.url())) {
    throw new Error('E2E_ADMIN_SETUP_USER still requires an initial password change. Complete that change before the MFA setup recording.');
  }
  await expect(page).toHaveURL(/\/admin(?:\/|$)/);
  await expect(page.getByRole('heading', { name: '관리자 MFA 설정', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'MFA 설정 시작', exact: true }).click();
  await expect(page.getByRole('img', { name: 'MFA 설정 QR 코드' })).toBeVisible();
  await expect(page.getByText('QR 스캔이 어려운 경우 수동 등록', { exact: true })).toBeVisible();
  await expect(page.getByLabel('6자리 인증 코드')).toBeVisible();
  await page.getByLabel('6자리 인증 코드').fill(setupCode);
  await page.getByRole('button', { name: '확인하고 활성화', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await pause(page, pauseMs(1_800));
  return true;
}

async function completeInitialPasswordChange(page: Page, currentPassword: string, newPassword: string) {
  if (process.env.E2E_ALLOW_INITIAL_PASSWORD_CHANGE !== 'true') {
    throw new Error('This account requires its initial password change. Complete it before recording, or set E2E_ALLOW_INITIAL_PASSWORD_CHANGE=true for the disposable live test account.');
  }
  await expect(page.getByRole('heading', { name: '계정 설정', level: 1 })).toBeVisible();
  await page.getByLabel('현재 비밀번호').fill(currentPassword);
  await page.getByLabel('새 비밀번호').fill(newPassword);
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Switches accounts without calling the application's logout endpoint.
 *
 * The full recording uses one browser page for a continuous presentation, but
 * the user and administrator credentials are intentionally separate. Clearing
 * the browser-only token/cookie state avoids changing the live session on the
 * server while still allowing the next login to be shown in the same video.
 */
export async function resetClientSession(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('b2bgearvia-refresh-session');
    localStorage.removeItem('b2bgearvia-session-mode');
    localStorage.removeItem('b2bgearvia-refresh-lock');
  });
  await page.context().clearCookies();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '로그인', level: 2 })).toBeVisible();
  await pause(page, pauseMs(700));
}

/**
 * Shows the two client-side navigation controls without changing any server
 * data. The workspace switcher is selected by the live group's id, which was
 * resolved from the group's own list rather than hard-coded in the test.
 */
export async function previewGlobalNavigation(page: Page, group: GroupRef) {
  const workspace = page.getByLabel('이동할 공간 선택');
  await expect(workspace).toBeVisible();
  await workspace.selectOption(String(group.id));
  await expect(page).toHaveURL(new RegExp(`/groups/${group.id}/dashboard/?$`));
  await pause(page, pauseMs(900));
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '바로가기', level: 2 })).toBeVisible();

  const language = page.getByRole('group', { name: 'Language', exact: true });
  await expect(language).toBeVisible();
  await language.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await pause(page, pauseMs(900));
  await language.getByRole('button', { name: '한글', exact: true }).click();
  await expect(page.getByRole('link', { name: '홈', exact: true })).toBeVisible();
  await pause(page, pauseMs(900));
}

/** PWA offline messaging is a local browser state transition; it is safe to
 * demonstrate and does not fabricate application records or API responses. */
export async function previewOfflineStatus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status').filter({ hasText: '오프라인입니다' })).toBeVisible();
  await pause(page, pauseMs(1_200));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await pause(page, pauseMs(700));
}

/**
 * The invitation page needs a real, pre-existing token. It deliberately stops
 * before accepting so the recording does not mutate membership on the live
 * non-production server.
 */
export async function previewConfiguredInvitation(page: Page) {
  const configured = requiredEnv('E2E_INVITATION_URL');
  const target = new URL(configured, page.url());
  const current = new URL(page.url());
  if (target.origin !== current.origin || target.pathname !== '/group-invitations/accept') {
    throw new Error('E2E_INVITATION_URL must be an invitation URL on the configured non-production origin.');
  }
  await page.goto(`${target.pathname}${target.search}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '그룹 초대', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: '초대 수락', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '나중에 하기', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_800));
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '바로가기', level: 2 })).toBeVisible();
}

/**
 * Shows the management controls for already-existing invitation credentials.
 * Creating, rotating, revoking, or copying a live credential is intentionally
 * not part of the default recording. The non-production group must therefore
 * already have an active invitation link and group key.
 */
export async function previewConfiguredInvitationControls(page: Page, group: GroupRef) {
  await visit(page, `${group.settingsPath}?tab=collaboration`, '그룹 설정');
  await expect(page.getByRole('heading', { name: '멤버 초대', level: 2 })).toBeVisible();

  await page.getByRole('button', { name: '초대 링크', exact: true }).click();
  const revokeLink = page.getByRole('button', { name: '링크 사용 중지', exact: true });
  await expect.poll(async () => await revokeLink.isVisible().catch(() => false), { timeout: 15_000 }).toBe(true);
  if (!await isVisible(revokeLink)) {
    throw new Error('The configured live group has no active invitation link. Prepare one manually in the non-production environment; this suite does not create invitation credentials.');
  }
  await expect(revokeLink).toBeVisible();
  const copyLink = page.getByRole('button', { name: '링크 복사', exact: true });
  if (await isVisible(copyLink)) {
    await expect(copyLink).toBeEnabled();
    await expect(page.locator('input[readonly]')).toBeVisible();
  }
  await pause(page, pauseMs(1_200));

  await page.getByRole('button', { name: '그룹 키', exact: true }).click();
  const reissueKey = page.getByRole('button', { name: /재발급/, exact: true });
  const deleteKey = page.getByRole('button', { name: '키 삭제', exact: true });
  if (!await isVisible(reissueKey) || !await isVisible(deleteKey)) {
    throw new Error('The configured live group has no active group key. Prepare an active non-demo group key manually; this suite does not create or revoke keys.');
  }
  await expect(reissueKey).toBeEnabled();
  await expect(deleteKey).toBeEnabled();
  const copyKey = page.getByRole('button', { name: '키 복사', exact: true });
  if (await isVisible(copyKey)) await expect(copyKey).toBeEnabled();
  await pause(page, pauseMs(1_500));
}

export async function openConfiguredGroup(page: Page): Promise<GroupRef> {
  await visit(page, '/groups', '그룹');
  const configuredName = requiredEnv('E2E_GROUP_NAME');
  const groupCandidates: Array<{ path: string; text: string; link: Locator }> = [];
  for (const link of await page.getByRole('link').all()) {
    const href = await link.getAttribute('href');
    if (!href) continue;
    const path = new URL(href, page.url()).pathname;
    if (!/^\/groups\/\d+\/dashboard$/.test(path)) continue;
    groupCandidates.push({ path, text: await link.innerText(), link });
  }
  const selected = groupCandidates.find((value) => textLines(value.text).includes(configuredName));
  if (!selected) {
    throw new Error(`E2E_GROUP_NAME=${configuredName} was not found. Available live team groups: ${groupCandidates.map((value) => value.text.replace(/\s+/g, ' / ')).join(', ') || '(none)'}`);
  }
  const id = Number(selected.path.match(/^\/groups\/(\d+)\/dashboard$/)?.[1]);
  const groupLink = selected.link;
  await expect(groupLink).toBeVisible();
  await groupLink.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selected.path)}/?$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await pause(page, pauseMs(1_500));
  return {
    id,
    name: configuredName,
    dashboardPath: selected.path,
    tasksPath: `/groups/${id}/tasks`,
    projectsPath: `/groups/${id}/projects`,
    membersPath: `/groups/${id}/members`,
    filesPath: `/groups/${id}/files`,
    chatPath: `/groups/${id}/chat`,
    settingsPath: `/groups/${id}`,
  };
}

export async function openConfiguredTask(page: Page, group: GroupRef): Promise<TaskRef> {
  const requestedId = process.env.E2E_TASK_ID?.trim();
  const requestedTitle = process.env.E2E_TASK_TITLE?.trim();
  if (!requestedId && !requestedTitle) {
    throw new Error('Set E2E_TASK_ID or E2E_TASK_TITLE to select an existing live task. No task is created by this suite.');
  }
  return openTaskFromList(page, group, { id: requestedId, title: requestedTitle }, 'E2E_TASK_ID/E2E_TASK_TITLE');
}

/** Opens a second, explicitly named existing task for a state-specific chapter. */
export async function openConfiguredTaskByEnv(page: Page, group: GroupRef, envName: string): Promise<TaskRef> {
  return openTaskFromList(page, group, { title: requiredEnv(envName) }, envName);
}

/**
 * Shows state-specific task controls using existing records. The controls that
 * would change server state are only asserted; reason-based controls are opened
 * and dismissed so their complete form is visible without submitting it.
 */
export async function previewConfiguredTaskActions(
  page: Page,
  group: GroupRef,
  envName: string,
  actionNames: string[],
  reasonActionNames: string[] = [],
) {
  await openConfiguredTaskByEnv(page, group, envName);
  for (const actionName of actionNames) {
    await expect(page.getByRole('button', { name: actionName, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: actionName, exact: true })).toBeEnabled();
  }
  for (const actionName of reasonActionNames) {
    await page.getByRole('button', { name: actionName, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: actionName, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('사유')).toBeVisible();
    if (actionName === '업무 보류') {
      await expect(dialog.getByLabel('보류 유형')).toBeVisible();
      await expect(dialog.getByLabel('다음 조치')).toBeVisible();
      await expect(dialog.getByLabel('확인 날짜')).toBeVisible();
    }
    await closeModal(page);
  }
  await pause(page, pauseMs(1_800));
}

/** Shows the leader-only first-assignee control without selecting or saving it. */
export async function previewConfiguredTaskAssignment(page: Page, group: GroupRef) {
  await openConfiguredTaskByEnv(page, group, 'E2E_TASK_ASSIGNABLE_TITLE');
  const assignment = page.getByRole('heading', { name: '다음 단계 · 첫 담당자 지정', level: 2 });
  await expect(assignment).toBeVisible();
  await expect(page.getByRole('combobox', { name: '담당자 선택' })).toBeVisible();
  await expect(page.getByRole('button', { name: '담당자 지정', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_200));
}

/** Shows the existing owner-change request and leader decision controls. */
export async function previewConfiguredTaskAssignmentApproval(page: Page, group: GroupRef) {
  await openConfiguredTaskByEnv(page, group, 'E2E_TASK_ASSIGNMENT_APPROVAL_TITLE');
  const requestSection = page.getByRole('heading', { name: '담당자 변경 요청', level: 2 });
  await expect(requestSection).toBeVisible();
  await expect(page.getByRole('button', { name: '승인 요청', exact: true })).toBeVisible();

  const approvalHeading = page.getByRole('heading', { name: '담당자 변경 승인 현황', level: 2 });
  await expect(approvalHeading).toBeVisible();
  const approvalSection = approvalHeading.locator('..');
  await expect(approvalSection.getByRole('button', { name: '승인', exact: true })).toBeVisible();
  await expect(approvalSection.getByRole('button', { name: '반려', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_800));
}

/** Shows the unassigned TODO claim control without claiming the live task. */
export async function previewConfiguredTaskClaim(page: Page, group: GroupRef) {
  await visit(page, group.tasksPath, new RegExp(`${escapeRegExp(group.name)} 업무`));
  const title = requiredEnv('E2E_TASK_UNASSIGNED_TODO_TITLE');
  const task = page.getByRole('article').filter({ has: page.getByText(title, { exact: true }) });
  await expect(task).toHaveCount(1);
  await expect(task.getByRole('button', { name: '내가 담당하기', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_200));
}

async function openTaskFromList(page: Page, group: GroupRef, selection: { id?: string; title?: string }, selectionLabel: string): Promise<TaskRef> {
  await visit(page, group.tasksPath, new RegExp(`${escapeRegExp(group.name)} 업무`));
  const taskCandidates: Array<{ path: string; text: string; link: Locator }> = [];
  for (const link of await page.getByRole('link').all()) {
    const href = await link.getAttribute('href');
    if (!href) continue;
    const path = new URL(href, page.url()).pathname;
    if (!/^\/tasks\/\d+$/.test(path)) continue;
    taskCandidates.push({ path, text: await link.innerText(), link });
  }
  const uniqueTasks = taskCandidates.filter((value, index, values) => values.findIndex((candidate) => candidate.path === value.path) === index);
  const selected = uniqueTasks.find((value) => (selection.id && value.path === `/tasks/${selection.id}`)
    || (selection.title && textLines(value.text).includes(selection.title)));
  if (!selected) {
    throw new Error(`The configured live task (${selectionLabel}) was not found in ${group.tasksPath}. Available task cards: ${uniqueTasks.map((value) => value.text.replace(/\s+/g, ' / ')).join(', ') || '(none)'}`);
  }
  await expect(selected.link).toBeVisible();
  await selected.link.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selected.path)}/?$`));
  await expect(page.getByRole('heading', { name: selection.title ?? /.+/, level: 1 })).toBeVisible();
  await pause(page, pauseMs(1_500));
  return { id: Number(selected.path.split('/').pop()), title: selection.title ?? textLines(selected.text)[0] ?? '', path: selected.path };
}

export async function openConfiguredProject(page: Page, group: GroupRef): Promise<ProjectRef> {
  await visit(page, group.projectsPath, new RegExp(`${escapeRegExp(group.name)} 프로젝트`));
  const projectCandidates: Array<{ path: string; text: string; row: Locator; manageLink: Locator }> = [];
  for (const row of await page.getByRole('row').all()) {
    const manageLinks = await row.getByRole('link', { name: '관리', exact: true }).all();
    if (manageLinks.length === 0) continue;
    const manageLink = manageLinks[0];
    const href = await manageLink.getAttribute('href');
    if (!href) continue;
    const path = new URL(href, page.url()).pathname;
    if (!/^\/projects\/\d+\/flow$/.test(path)) continue;
    projectCandidates.push({ path, text: await row.innerText(), row, manageLink });
  }
  const requestedId = process.env.E2E_PROJECT_ID?.trim();
  const requestedName = process.env.E2E_PROJECT_NAME?.trim();
  if (!requestedId && !requestedName) {
    throw new Error('Set E2E_PROJECT_ID or E2E_PROJECT_NAME to select an existing live project. No project is created by this suite.');
  }
  let selected = projectCandidates.find((value) => requestedId && value.path === `/projects/${requestedId}/flow`);
  if (!selected && requestedName) {
    for (const candidate of projectCandidates) {
      if (await candidate.row.getByRole('button', { name: new RegExp(escapeRegExp(requestedName)) }).count() > 0) {
        selected = candidate;
        break;
      }
    }
  }
  if (!selected) {
    throw new Error(`The configured live project was not found in ${group.projectsPath}. Available project rows: ${projectCandidates.map((value) => value.text.replace(/\s+/g, ' / ')).join(', ') || '(none)'}`);
  }
  const projectName = requestedName ?? await projectExpandLabel(selected.row);
  const manageLink = selected.manageLink;
  await expect(manageLink).toBeVisible();
  await manageLink.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selected.path)}/?$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await pause(page, pauseMs(1_500));
  return { id: Number(selected.path.split('/')[2]), name: projectName, path: selected.path };
}

export async function previewConfiguredProjectList(page: Page, group: GroupRef): Promise<{ row: Locator; name: string }> {
  await visit(page, group.projectsPath, new RegExp(`${escapeRegExp(group.name)} 프로젝트`));
  const requestedId = envValue('E2E_PROJECT_ID');
  const requestedName = envValue('E2E_PROJECT_NAME');
  const rows = await page.getByRole('row').all();
  let selectedRow: Locator | undefined;
  for (const row of rows) {
    const manage = row.getByRole('link', { name: '관리', exact: true });
    if (await manage.count() === 0) continue;
    const href = await manage.getAttribute('href');
    if (!href) continue;
    const path = new URL(href, page.url()).pathname;
    if (requestedId && path === `/projects/${requestedId}/flow`) selectedRow = row;
    if (!selectedRow && requestedName && await row.getByRole('button', { name: new RegExp(escapeRegExp(requestedName)) }).count() > 0) selectedRow = row;
    if (selectedRow) break;
  }
  if (!selectedRow) throw new Error('The configured project row was not found for the project-list preview. Set E2E_PROJECT_ID or E2E_PROJECT_NAME to an existing live project.');
  const projectLabel = requestedName ?? await projectExpandLabel(selectedRow);
  const expand = selectedRow.getByRole('button', { name: new RegExp(escapeRegExp(projectLabel)) });
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('프로젝트 주제', { exact: true })).toBeVisible();
  await pause(page, pauseMs(1_200));
  return { row: selectedRow, name: projectLabel };
}

/**
 * Shows project action-item checklist and image controls from a real issue.
 * The issue and its image are selected by title/visible controls, never by a
 * generated numeric id. No checklist, image, or archive operation is sent.
 */
export async function previewConfiguredProjectIssueControls(page: Page) {
  const issueTitle = requiredEnv('E2E_PROJECT_ISSUE_TITLE');
  const issue = page.getByRole('article').filter({ has: page.getByText(issueTitle, { exact: true }) });
  await expect(issue).toHaveCount(1);
  await expect(issue.getByRole('button', { name: '수정', exact: true })).toBeVisible();
  await expect(issue.getByRole('button', { name: /보관/, exact: true })).toBeVisible();

  const checklist = issue.getByRole('checkbox');
  if (await checklist.count() === 0) {
    throw new Error(`E2E_PROJECT_ISSUE_TITLE=${issueTitle} has no existing checklist item. Prepare a non-demo action item with checklist content.`);
  }
  await expect(checklist.first()).toBeVisible();
  await expect(issue.getByPlaceholder('다음 작업 입력')).toBeVisible();
  await expect(issue.getByLabel('이미지')).toBeVisible();

  const imageDelete = issue.getByRole('button', { name: '이미지 삭제', exact: true });
  if (await imageDelete.count() === 0) {
    throw new Error(`E2E_PROJECT_ISSUE_TITLE=${issueTitle} has no existing image. Prepare one manually if image deletion is required in the recording.`);
  }
  await expect(imageDelete.first()).toBeVisible();
  await pause(page, pauseMs(1_800));
}

async function projectExpandLabel(row: Locator) {
  for (const button of await row.getByRole('button').all()) {
    if (await button.getAttribute('aria-expanded') === null) continue;
    const value = (await button.innerText()).trim().replace(/^[›⌄]\s*/, '');
    if (value) return value;
  }
  throw new Error('The configured project row has no accessible expand control. The live UI may have changed.');
}

/** Returns an explicitly configured admin table row without relying on row order. */
export async function configuredAdminRow(page: Page, envName: string, actionName?: string) {
  const target = requiredEnv(envName);
  for (const row of await page.getByRole('row').all()) {
    if (await row.getByText(target, { exact: true }).count() === 0) continue;
    if (actionName && await row.getByRole('button', { name: actionName, exact: true }).count() === 0) continue;
    await expect(row).toBeVisible();
    return row;
  }
  throw new Error(`The configured admin record (${envName}=${target}) was not found${actionName ? ` with action ${actionName}` : ''}. Use an existing non-demo record in the non-production environment.`);
}

/**
 * Exercises the overview cards as navigation controls. The cards only change
 * the admin view or scroll position, so this is safe to show in a live
 * non-production recording.
 */
export async function previewAdminOverview(page: Page) {
  await ensureAdminTabs(page);
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  const summary = page.getByRole('region', { name: '운영 현황 요약' });
  await expect(summary).toBeVisible();
  await expect(page.getByRole('heading', { name: '그룹 현황', level: 2 })).toBeVisible();

  const statDestinations: Array<[string, string]> = [
    ['전체 사용자', '/admin/users'], ['활성 사용자', '/admin/users'], ['정지 사용자', '/admin/users'],
    ['전체 그룹', '/admin'], ['팀 그룹', '/admin'],
    ['리포트 다운로드', '/admin/reports'], ['리포트 발송', '/admin/reports'], ['리포트 발송 실패', '/admin/reports'],
  ];
  for (const [label, destination] of statDestinations) {
    // 카드 이름은 "<라벨> <수치>" 형태. "리포트 발송" 이 "리포트 발송 실패" 를 함께
    // 잡지 않도록 라벨 뒤에 공백+숫자를 요구하고, 그래도 여러 개면 첫 번째를 쓴다.
    const card = summary
      .getByRole('button', { name: new RegExp('^' + escapeRegExp(label) + '\\s+\\d') })
      .first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(destination)}\\/?$`));
    await pause(page, pauseMs(650));
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await expect(summary).toBeVisible();
  }
  await pause(page, pauseMs(1_200));
}

/** Shows every non-destructive control exposed by the admin user table. */
export async function previewConfiguredAdminUsers(page: Page) {
  await visitAdminTab(page, '사용자 관리', '사원 계정 등록');
  await expect(page.getByLabel('사원 이름')).toBeVisible();
  await expect(page.getByLabel('회사 메일')).toBeVisible();
  await expect(page.getByRole('button', { name: '사원 등록', exact: true })).toBeVisible();

  const activeRow = await configuredAdminRow(page, 'E2E_ADMIN_ACTIVE_USER_NAME', '정지');
  await expect(activeRow.getByRole('button', { name: '수정', exact: true })).toBeVisible();
  await expect(activeRow.getByRole('button', { name: '비밀번호 재설정', exact: true })).toBeVisible();
  await expect(activeRow.getByRole('button', { name: '삭제', exact: true })).toBeVisible();

  await activeRow.getByRole('button', { name: '수정', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: '사용자 정보 수정' });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel('이름')).toBeVisible();
  await closeModal(page);

  await activeRow.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '사용자 삭제' })).toBeVisible();
  await closeModal(page);

  const suspendedRow = await configuredAdminRow(page, 'E2E_ADMIN_SUSPENDED_USER_NAME', '복구');
  await expect(suspendedRow.getByRole('button', { name: '복구', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_800));
}

/** Shows task suspension, delete confirmation, resume, and restore controls. */
export async function previewConfiguredAdminTasks(page: Page) {
  await visitAdminTab(page, '업무 관리', '업무');
  await expect(page.getByRole('heading', { name: '최근 삭제된 업무', level: 2 })).toBeVisible();

  const activeRow = await configuredAdminRow(page, 'E2E_ADMIN_ACTIVE_TASK_TITLE', '정지');
  await expect(activeRow.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
  await activeRow.getByRole('button', { name: '정지', exact: true }).click();
  const suspendDialog = page.getByRole('dialog', { name: '업무 정지' });
  await expect(suspendDialog).toBeVisible();
  await expect(suspendDialog.getByLabel('정지 사유')).toBeVisible();
  await closeModal(page);

  await activeRow.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '업무 삭제' })).toBeVisible();
  await closeModal(page);

  const onHoldRow = await configuredAdminRow(page, 'E2E_ADMIN_ON_HOLD_TASK_TITLE', '재개');
  await expect(onHoldRow.getByRole('button', { name: '재개', exact: true })).toBeVisible();
  const deletedRow = await configuredAdminRow(page, 'E2E_ADMIN_DELETED_TASK_TITLE', '복구');
  await expect(deletedRow.getByRole('button', { name: '복구', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_800));
}

/** Shows a real pending notice's cancellation control without cancelling it. */
export async function previewConfiguredPendingNotice(page: Page) {
  await visitAdminTab(page, '공지 발송', '전체 팀장 공지');
  await expect(page.getByLabel('제목')).toBeVisible();
  await expect(page.getByLabel('내용')).toBeVisible();
  await expect(page.getByLabel('예약 일시')).toBeVisible();
  await expect(page.getByRole('button', { name: '예약 발송', exact: true })).toBeVisible();
  const pendingRow = await configuredAdminRow(page, 'E2E_ADMIN_PENDING_NOTICE_TITLE', '취소');
  await expect(pendingRow.getByRole('button', { name: '취소', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_800));
}

/** Shows both safe-to-preview urgent-issue status actions using existing rows. */
export async function previewConfiguredEmergencyIssues(page: Page, group: GroupRef) {
  await visit(page, `/groups/${group.id}/emergency-issues`, '긴급 이슈 관리');
  const openTab = page.getByRole('tab', { name: /미해결|열린/ });
  const resolvedTab = page.getByRole('tab', { name: /해결/ });
  await openTab.click();
  const openTitle = requiredEnv('E2E_OPEN_EMERGENCY_ISSUE_TITLE');
  const openCard = page.getByRole('article').filter({ has: page.getByText(openTitle, { exact: true }) });
  await expect(openCard).toHaveCount(1);
  await expect(openCard.getByRole('button', { name: '해결 처리', exact: true })).toBeVisible();
  await pause(page, pauseMs(900));

  await resolvedTab.click();
  const resolvedTitle = requiredEnv('E2E_RESOLVED_EMERGENCY_ISSUE_TITLE');
  const resolvedCard = page.getByRole('article').filter({ has: page.getByText(resolvedTitle, { exact: true }) });
  await expect(resolvedCard).toHaveCount(1);
  await expect(resolvedCard.getByRole('button', { name: '다시 열기', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_200));
}

/** Shows an existing notification's open and delete controls without opening
 * it (opening an unread item marks it read) or deleting it. */
export async function previewConfiguredNotification(page: Page) {
  await visit(page, '/notifications', '알림');
  const title = requiredEnv('E2E_NOTIFICATION_TITLE');
  const item = page.getByRole('article').filter({ has: page.getByText(title, { exact: true }) });
  await expect(item).toHaveCount(1);
  await expect(item.getByRole('button', { name: /알림 삭제/ })).toBeVisible();
  const openButton = item.getByRole('button').filter({ has: item.getByText(title, { exact: true }) });
  await expect(openButton).toBeVisible();
  await pause(page, pauseMs(1_200));
}

/** Shows the existing project document controls without downloading or
 * deleting the live document. */
export async function previewConfiguredProjectDocument(page: Page) {
  const title = requiredEnv('E2E_PROJECT_RESOURCE_TITLE');
  const item = page.getByRole('article').filter({ has: page.getByText(title, { exact: true }) });
  await expect(item).toHaveCount(1);
  const open = item.getByRole('link', { name: '열기', exact: true });
  const download = item.getByRole('button', { name: '다운로드', exact: true });
  if (await open.count() === 0 && await download.count() === 0) {
    throw new Error(`E2E_PROJECT_RESOURCE_TITLE=${title} has no visible open/download control.`);
  }
  await expect(item.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_200));
}

export async function previewTaskCreate(page: Page, buttonName: string) {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 업무 만들기' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('제목')).toBeVisible();
  await expect(dialog.getByLabel('설명 (선택)')).toBeVisible();
  await expect(dialog.getByLabel('우선순위')).toBeVisible();
  await expect(dialog.getByLabel('마감 날짜·시간 (선택)')).toBeVisible();

  const project = dialog.getByLabel('프로젝트');
  if (await project.count() > 0 && await project.isVisible()) {
    const projectId = envValue('E2E_PROJECT_ID');
    const projectName = envValue('E2E_PROJECT_NAME');
    if (projectId) await project.selectOption({ value: projectId });
    else if (projectName && await project.getByRole('option', { name: projectName, exact: true }).count() > 0) await project.selectOption({ label: projectName });
    const topic = dialog.getByLabel('주제');
    if (await topic.count() > 0) await expect(topic).toBeVisible();
  }
  await dialog.getByRole('button', { name: '체크리스트 항목 추가', exact: true }).click();
  await expect(dialog.getByLabel('체크리스트 1번 항목')).toBeVisible();
  await pause(page, pauseMs(1_000));
  await closeModal(page);
}

/** Shows the policy lock for a real team in which the user is not a leader. */
export async function previewConfiguredAssistantPolicy(page: Page) {
  const groupName = requiredEnv('E2E_ASSISTANT_DISABLED_GROUP_NAME');
  const workspace = page.getByLabel('작업할 그룹');
  await expect(workspace).toBeVisible();
  await workspace.selectOption({ label: groupName });
  await expect(page.getByRole('heading', { name: 'AI 비서는 관리자 정책에서 허용된 팀장 기능입니다.', level: 2 })).toBeVisible();
  await expect(page.getByText('서버 관리자가 AI 기능과 API 키를 설정하면 팀장이 사용할 수 있습니다.')).toBeVisible();
  await pause(page, pauseMs(1_800));
}

/** Shows a real pending AI action without confirming or cancelling it. */
export async function previewConfiguredAssistantPendingAction(page: Page) {
  const summary = requiredEnv('E2E_ASSISTANT_PENDING_ACTION_SUMMARY');
  const assistant = page.getByRole('region', { name: 'AI 비서 대화' });
  const actionSummary = assistant.getByText(summary, { exact: true });
  await expect(actionSummary).toBeVisible();
  const actionCard = actionSummary.locator('..');
  await expect(actionCard.getByRole('button', { name: '확인하고 실행', exact: true })).toBeVisible();
  await expect(actionCard.getByRole('button', { name: '취소', exact: true })).toBeVisible();
  await pause(page, pauseMs(1_800));
}

export async function openConfiguredCalendarItem(page: Page, required = false) {
  const title = envValue('E2E_CALENDAR_EVENT_TITLE');
  if (!title) {
    if (required) throw new Error('Set E2E_CALENDAR_EVENT_TITLE to an existing event in the recording month.');
    return false;
  }
  const event = page.getByRole('button', { name: new RegExp(escapeRegExp(title)) });
  const selected = await firstVisible(event);
  if (!selected) {
    throw new Error(`E2E_CALENDAR_EVENT_TITLE=${title} was not found in the current calendar month.`);
  }
  await selected.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await pause(page, pauseMs(1_200));
  return true;
}

export async function openConfiguredChannel(page: Page, group: GroupRef): Promise<ChannelRef> {
  const configuredName = requiredEnv('E2E_CHANNEL_NAME');
  await visit(page, '/chat', '채팅');
  const groupButton = page.getByRole('button', { name: group.name, exact: true });
  await expect(groupButton).toBeVisible();
  await groupButton.click();
  const channelCandidates: Array<{ link: Locator; text: string }> = [];
  for (const link of await page.getByRole('link').all()) {
    const href = await link.getAttribute('href');
    if (!href) continue;
    const path = new URL(href, page.url()).pathname;
    if (path !== group.chatPath) continue;
    channelCandidates.push({ link, text: await link.innerText() });
  }
  const selected = channelCandidates.find((value) => textLines(value.text).includes(configuredName));
  if (!selected) {
    throw new Error(`E2E_CHANNEL_NAME=${configuredName} was not found in the live chat browser for ${group.name}. Available channels: ${channelCandidates.map((value) => value.text.replace(/\s+/g, ' / ')).join(', ') || '(none)'}`);
  }
  await expect(selected.link).toBeVisible();
  await selected.link.click();
  await expect(page.getByPlaceholder('메시지를 입력하세요')).toBeVisible();
  await pause(page, pauseMs(1_500));
  return { name: configuredName };
}

export async function visitAdminTab(page: Page, label: string, heading: string | RegExp) {
  await ensureAdminTabs(page);
  const link = page.getByRole('link', { name: label, exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  if (!href) throw new Error(`Admin tab ${label} does not expose a route.`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(new URL(href, page.url()).pathname)}\\/?$`));
  await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible();
  await mark(page, `tab:${label}`);
  await pause(page);
}

export async function ensureAdminTabs(page: Page) {
  const tabsButton = page.getByRole('button', { name: '탭 화면', exact: true });
  if (await tabsButton.count() === 0) return;
  const classes = await tabsButton.getAttribute('class');
  if (!classes?.split(/\s+/).includes('active')) {
    await tabsButton.click();
    await expect(tabsButton).toHaveAttribute('class', /active/);
    await pause(page);
  }
}

export function assertLiveRecording() {
  markStart();
  const mode = (process.env.E2E_MODE ?? 'live').toLowerCase();
  if (mode !== 'live') {
    throw new Error('Only E2E_MODE=live is supported. Synthetic demo data and API fixtures are disabled.');
  }
  if (process.env.E2E_LIVE_CONFIRMED !== 'true') {
    throw new Error('Set E2E_LIVE_CONFIRMED=true after confirming that E2E_BASE_URL points to a non-production environment.');
  }
  const baseURL = process.env.E2E_BASE_URL?.trim();
  if (baseURL && /(^|\.)totaskflow\.com$/i.test(new URL(baseURL).hostname)) {
    throw new Error('The recording base URL must be a non-production environment. Production SaaS recording is blocked.');
  }
  if (process.env.E2E_USE_DEMO_DATA === 'true') {
    throw new Error('E2E_USE_DEMO_DATA=true is not supported. Prepare and select existing non-demo live data instead.');
  }
  if (process.env.DEMO_ENABLED?.toLowerCase() !== 'false') {
    throw new Error('Set DEMO_ENABLED=false in the backend and Playwright process. Demo mode is never used by this recording.');
  }
  const selectedValues = [
    'E2E_USER', 'E2E_ADMIN_USER', 'E2E_GROUP_NAME', 'E2E_TASK_TITLE', 'E2E_TASK_ID', 'E2E_PROJECT_NAME', 'E2E_PROJECT_ID',
    'E2E_CHANNEL_NAME', 'E2E_INVITATION_URL', 'E2E_CHECKLIST_ITEM_TEXT', 'E2E_COMMENT_TEXT', 'E2E_RESOURCE_TITLE', 'E2E_PROJECT_RESOURCE_TITLE',
    'E2E_NOTIFICATION_TITLE', 'E2E_TASK_ASSIGNABLE_TITLE', 'E2E_TASK_REQUESTED_TITLE', 'E2E_TASK_TODO_TITLE', 'E2E_TASK_IN_PROGRESS_TITLE', 'E2E_TASK_ON_HOLD_TITLE', 'E2E_TASK_COMPLETED_TITLE',
    'E2E_TASK_ASSIGNMENT_APPROVAL_TITLE', 'E2E_PROJECT_ISSUE_TITLE', 'E2E_ASSISTANT_DISABLED_GROUP_NAME', 'E2E_ASSISTANT_PENDING_ACTION_SUMMARY',
    'E2E_OPEN_EMERGENCY_ISSUE_TITLE', 'E2E_RESOLVED_EMERGENCY_ISSUE_TITLE', 'E2E_ADMIN_ACTIVE_USER_NAME', 'E2E_ADMIN_SUSPENDED_USER_NAME',
    'E2E_ADMIN_ACTIVE_TASK_TITLE', 'E2E_ADMIN_ON_HOLD_TASK_TITLE', 'E2E_ADMIN_DELETED_TASK_TITLE', 'E2E_ADMIN_PENDING_NOTICE_TITLE',
    'E2E_ADMIN_SETUP_USER',
  ]
    .map((name) => process.env[name]?.trim() ?? '');
  if (selectedValues.some((value) => /(^|[^a-z])demo([_-]|[^a-z]|$)|b2bgearvia\.local/i.test(value))) {
    throw new Error('Demo accounts/data are not allowed. Use existing non-demo accounts and records in the recording environment.');
  }
}

export function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Live recording does not create fallback accounts or data.`);
  return value;
}

/**
 * Returns a current admin MFA code. Prefers E2E_ADMIN_MFA_CODE (static, from an
 * authenticator app) but, for a disposable recording VM, accepts
 * E2E_ADMIN_MFA_SECRET (Base32) and computes a fresh TOTP so the code cannot go
 * stale during Playwright startup.
 */
export function adminMfaCode(): string {
  const secret = process.env.E2E_ADMIN_MFA_SECRET?.trim().toUpperCase().replace(/=+$/, '');
  if (secret) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes: number[] = [];
    let bits = 0, val = 0;
    for (const c of secret) {
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
  return adminMfaCode();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
