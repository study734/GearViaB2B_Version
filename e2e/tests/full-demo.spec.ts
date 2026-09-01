import {
  allowAiCalls,
  allowRagReindex,
  allowReadOnlyActions,
  closeModal,
  clickIfVisible,
  firstVisible,
  previewAdminOverview,
  previewConfiguredAdminTasks,
  previewConfiguredAdminMfaSetup,
  previewConfiguredAdminUsers,
  previewConfiguredEmergencyIssues,
  previewConfiguredAssistantPendingAction,
  previewConfiguredAssistantPolicy,
  previewConfiguredPendingNotice,
  previewConfiguredNotification,
  previewConfiguredProjectDocument,
  previewConfiguredProjectIssueControls,
  previewConfiguredTaskAssignment,
  previewConfiguredTaskAssignmentApproval,
  requiredEnv,
  expect,
  isVisible,
  loginAsAdmin,
  loginAsUser,
  openConfiguredCalendarItem,
  openConfiguredChannel,
  openConfiguredGroup,
  openConfiguredProject,
  openConfiguredTask,
  openConfiguredTaskByEnv,
  pause,
  previewConfiguredInvitation,
  previewConfiguredInvitationControls,
  previewGlobalNavigation,
  previewOfflineStatus,
  previewConfiguredProjectList,
  previewConfiguredTaskActions,
  previewConfiguredTaskClaim,
  previewTaskCreate,
  resetClientSession,
  test,
  visit,
  visitAdminTab,
  ensureAdminTabs,
} from '../support/live-test';

test.describe('B2BGearVia full presentation demo', () => {
  test('captures every implemented user and on-premise operations surface', async ({ page }) => {
    await test.step('00 · Public policy pages', async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login\/?$/);
      await visit(page, '/privacy', '개인정보 처리방침');
      await visit(page, '/terms', '서비스 이용약관');
    });

    await test.step('01 · On-Premise authentication and personal dashboard', async () => {
      await loginAsUser(page);
      await page.goto('/app', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '바로가기', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '내 우선 업무', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '다가오는 일정', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '그룹별 내 업무', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '미확인 알림', level: 2 })).toBeVisible();
      await previewOfflineStatus(page);
      await pause(page, 2_000);
    });

    const group = await openConfiguredGroup(page);

    await test.step('02 · Group creation, joining, settings, membership, and invitations', async () => {
      await previewGlobalNavigation(page, group);
      await visit(page, '/groups', '그룹');
      await expect(page.getByRole('button', { name: '새 그룹', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '그룹 키로 참여', exact: true })).toBeVisible();

      await page.getByRole('button', { name: '새 그룹', exact: true }).click();
      const createGroup = page.getByRole('dialog', { name: '새 그룹 만들기' });
      await expect(createGroup).toBeVisible();
      await expect(createGroup.getByLabel('팀 이름')).toBeVisible();
      await expect(createGroup.getByLabel('설명 (선택)')).toBeVisible();
      await expect(createGroup.getByLabel('시간대')).toBeVisible();
      await expect(createGroup.getByRole('button', { name: '그룹 만들기', exact: true })).toBeVisible();
      await closeModal(page);

      await page.getByRole('button', { name: '그룹 키로 참여', exact: true }).click();
      const joinGroup = page.getByRole('dialog', { name: '그룹 키로 참여' });
      await expect(joinGroup).toBeVisible();
      await expect(joinGroup.getByLabel('그룹 키')).toBeVisible();
      await expect(joinGroup.getByRole('button', { name: '그룹 참여', exact: true })).toBeVisible();
      await closeModal(page);

      await visit(page, group.settingsPath, '그룹 설정');
      await expect(page.getByRole('navigation', { name: '그룹 바로가기' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: '설정 항목' })).toBeVisible();
      await expect(page.getByRole('button', { name: /^기본/ })).toHaveAttribute('class', /active/);
      await expect(page.getByLabel('그룹 이름')).toBeVisible();
      await expect(page.getByText('새 그룹 아이콘 선택', { exact: true })).toBeVisible();
      await expect(page.getByLabel('설명')).toBeVisible();
      await expect(page.getByLabel('기준 시간대')).toBeVisible();
      await expect(page.getByLabel('대시보드 공개 범위')).toBeVisible();
      await expect(page.getByRole('button', { name: '설정 저장', exact: true })).toBeVisible();
      await expect(page.getByText(/JPG, PNG, GIF/)).toBeVisible();

      await page.getByRole('button', { name: /^협업/ }).click();
      await expect(page.getByRole('heading', { name: '팀원 목록', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '그룹 자료', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '멤버 초대', level: 2 })).toBeVisible();
      await page.getByRole('button', { name: '이메일 초대', exact: true }).click();
      await expect(page.getByPlaceholder('초대할 이메일')).toBeVisible();
      await expect(page.getByRole('button', { name: '초대 메일 보내기', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '초대 링크', exact: true }).click();
      await expect(page.getByText(/초대 링크 만들기|현재 사용 중인 초대 링크/)).toBeVisible();
      await pause(page, 800);
      await page.getByRole('button', { name: '그룹 키', exact: true }).click();
      await expect(page.getByText(/그룹 키|활성화되어 있습니다|활성화된 그룹 키가 없습니다/)).toBeVisible();
      await pause(page, 800);
      await pause(page, 1_800);

      await page.getByRole('button', { name: /^리포트/ }).click();
      await expect(page.getByRole('heading', { name: '그룹 리포트', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '메일 리포트 일정', level: 3 })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: '주간 리포트', exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: '월간 리포트', exact: true })).toBeVisible();
      await expect(page.getByLabel('발송 요일')).toBeVisible();
      await expect(page.getByLabel('발송일')).toBeVisible();
      await expect(page.getByLabel('리포트 언어')).toBeVisible();
      await page.getByLabel('리포트 언어').selectOption('BOTH');
      const editRecipient = page.getByRole('button', { name: '수정', exact: true });
      await expect(editRecipient).toBeVisible();
      await editRecipient.click();
      await expect(page.getByLabel('수신 이메일')).toBeEditable();
      await page.getByRole('button', { name: '취소', exact: true }).click();
      await expect(page.getByRole('button', { name: '메일 일정 저장', exact: true })).toBeVisible();
      await pause(page, 1_800);

      await visit(page, group.membersPath, '팀원');
      await expect(page.getByRole('heading', { name: '팀원 목록', level: 2 })).toBeVisible();
      await expect(page.getByRole('region', { name: '팀원 요약' })).toBeVisible();
      const memberSearch = page.getByPlaceholder('이름으로 검색');
      await expect(memberSearch).toBeVisible();
      await memberSearch.fill(group.name);
      await memberSearch.fill('');
      const memberRoles = await page.getByRole('combobox', { name: /역할/ }).all();
      if (memberRoles.length === 0) throw new Error('The live group has no visible member role controls. Prepare a team with at least one active member.');
      await expect(memberRoles[0]).toBeVisible();
      await expect(page.getByRole('button', { name: '내보내기', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '이 그룹에서 나가기', exact: true })).toBeVisible();
      await previewConfiguredInvitationControls(page, group);
      await previewConfiguredInvitation(page);
      await pause(page, 1_500);
    });

    await test.step('03 · Group dashboard, task creation, reporting, and workload drill-down', async () => {
      await visit(page, group.dashboardPath, new RegExp(`${escapeRegExp(group.name)} 대시보드`));
      await expect(page.getByRole('heading', { name: '기간별 상세 현황', level: 2 })).toBeVisible();
      await expect(page.getByRole('region', { name: '기간 핵심 지표' })).toBeVisible();

      const previousMonth = page.getByRole('button', { name: /이전 달$/ });
      const currentMonth = page.getByRole('button', { name: '이번 달', exact: true });
      await expect(previousMonth).toBeVisible();
      await expect(currentMonth).toBeVisible();
      await previousMonth.click();
      await pause(page, 1_000);
      await currentMonth.click();
      await pause(page, 1_000);
      await expect(page.getByLabel('연도')).toBeVisible();
      await expect(page.getByLabel('월')).toBeVisible();
      await expect(page.getByLabel('주차')).toBeVisible();

      await previewTaskCreate(page, '새 업무');

      const statusNames = ['승인 대기', '할 일', '진행 중', '보류', '완료', '반려', '취소', '지연'];
      for (const statusName of statusNames) {
        const statusButton = page.getByRole('button', { name: new RegExp(`^${escapeRegExp(statusName)}(?:\\s|$)`) });
        await expect(statusButton).toBeVisible();
        await statusButton.click();
        await pause(page, 700);
      }
      const memberMetric = page.getByRole('button', { name: /님의 .* 업무 보기$/ });
      const memberMetrics = await memberMetric.all();
      for (const metric of memberMetrics) {
        await metric.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await pause(page, 1_200);
        await closeModal(page);
      }

      const reportScope = page.getByLabel('범위');
      await expect(reportScope).toBeVisible();
      const reportPeriod = page.getByLabel('기간');
      await expect(reportPeriod).toBeVisible();
      await reportScope.selectOption('MY');
      await reportPeriod.selectOption('YEARLY');
      await expect(page.getByRole('button', { name: '내 리포트 생성', exact: true })).toBeVisible();
      await reportPeriod.selectOption('MONTHLY');

      // Use a completed real period for the AI-report screen. No record is
      // changed by moving the dashboard period; generation/download is opt-in.
      await page.getByRole('button', { name: /이전 달$/ }).click();
      await reportScope.selectOption('GROUP');
      await expect(page.getByRole('button', { name: '한국어 다운로드', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'English download', exact: true })).toBeVisible();
      const aiReportButton = page.getByRole('button', { name: 'AI 리포트', exact: true });
      await expect(aiReportButton).toBeVisible();
      await aiReportButton.click();
      const aiDialog = page.getByRole('dialog', { name: 'AI 리포트 언어 선택' });
      await expect(aiDialog).toBeVisible();
      await expect(aiDialog.getByRole('button', { name: '한국어 다운로드', exact: true })).toBeVisible();
      await expect(aiDialog.getByRole('button', { name: 'English download', exact: true })).toBeVisible();
      if (allowAiCalls()) {
        await aiDialog.getByRole('button', { name: '한국어 다운로드', exact: true }).click();
        const existingAiDialog = page.getByRole('dialog', { name: '이미 만든 리포트가 있습니다' });
        if (await isVisible(existingAiDialog)) {
          await existingAiDialog.getByRole('button', { name: '아니요, 기존 리포트 받기', exact: true }).click();
        }
        await expect(page.getByText(/AI 리포트를 내려받았습니다\.|The AI report was downloaded\./)).toBeVisible({ timeout: 120_000 });
        if (await isVisible(page.getByRole('dialog'))) await closeModal(page);
      } else {
        await closeModal(page);
      }
      if (allowReadOnlyActions()) {
        await page.getByRole('button', { name: '한국어 다운로드', exact: true }).click();
        await expect(page.getByText('기본 PDF 리포트를 다운로드했습니다.', { exact: true })).toBeVisible({ timeout: 45_000 });
        await page.getByRole('button', { name: 'English download', exact: true }).click();
        await expect(page.getByText('기본 PDF 리포트를 다운로드했습니다.', { exact: true })).toBeVisible({ timeout: 45_000 });
      }
      await pause(page, 2_000);
    });

    await test.step('04 · Task workflow, checklist, comments, mentions, attachments, and status reason', async () => {
      await visit(page, group.tasksPath, new RegExp(`${escapeRegExp(group.name)} 업무`));
      await previewTaskCreate(page, '업무 만들기');
      await previewConfiguredTaskClaim(page, group);
      await previewConfiguredTaskAssignment(page, group);
      await previewConfiguredTaskAssignmentApproval(page, group);
      await openConfiguredTask(page, group);
      await expect(page.getByRole('heading', { name: '체크리스트', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '댓글', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '상태 이력', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: '업무 첨부', level: 2 })).toBeVisible();
      await expect(page.getByLabel('새 댓글 내용')).toBeVisible();
      const mentionGroup = page.getByRole('group', { name: /멘션할 멤버/ });
      await expect(mentionGroup).toBeVisible();
      const mentionChoices = await mentionGroup.getByRole('checkbox').all();
      if (mentionChoices.length > 0) {
        await mentionChoices[0].check();
        await mentionChoices[0].uncheck();
      }
      await page.getByLabel('새 댓글 내용').fill('');
      const newChecklist = page.getByLabel('새 체크리스트 내용');
      if (await isVisible(newChecklist)) {
        await newChecklist.fill('');
        await expect(newChecklist).toBeEditable();
      }

      const editTask = page.getByRole('button', { name: '업무 내용 수정', exact: true });
      if (await isVisible(editTask)) {
        await editTask.click();
        const taskEditor = page.locator('form.task-edit-form');
        await expect(taskEditor).toBeVisible();
        await expect(taskEditor.getByLabel('제목')).toBeVisible();
        await expect(taskEditor.getByLabel('설명')).toBeVisible();
        await expect(taskEditor.getByLabel('우선순위')).toBeVisible();
        await expect(taskEditor.getByLabel('마감일')).toBeVisible();
        await taskEditor.getByRole('button', { name: '취소', exact: true }).click();
      }

      const projectConnection = page.getByRole('button', { name: '연결 저장', exact: true });
      if (await isVisible(projectConnection)) {
        await expect(page.getByRole('combobox', { name: '프로젝트' })).toBeVisible();
        await expect(page.getByRole('combobox', { name: '주제' })).toBeVisible();
      }

      for (const actionName of ['요청 승인', '업무 시작', '업무 완료', '업무 재개', '완료 업무 재개']) {
        const actionButton = page.getByRole('button', { name: actionName, exact: true });
        if (await isVisible(actionButton)) await expect(actionButton).toBeEnabled();
      }

      for (const reasonActionName of ['업무 보류', '요청 반려', '업무 취소']) {
        const reasonActionButton = page.getByRole('button', { name: reasonActionName, exact: true });
        if (!await isVisible(reasonActionButton)) continue;
        await reasonActionButton.click();
        const reasonDialog = page.getByRole('dialog');
        await expect(reasonDialog).toBeVisible();
        await expect(reasonDialog.getByLabel('사유')).toBeVisible();
        if (reasonActionName === '업무 보류') {
          await expect(reasonDialog.getByLabel('보류 유형')).toBeVisible();
          await expect(reasonDialog.getByLabel('다음 조치')).toBeVisible();
          await expect(reasonDialog.getByLabel('확인 날짜')).toBeVisible();
        }
        await closeModal(page);
      }

      const assignButton = page.getByRole('button', { name: '담당자 지정', exact: true });
      if (await isVisible(assignButton)) {
        await expect(page.getByRole('combobox', { name: '담당자 선택' })).toBeVisible();
      }
      const requestAssigneeButton = page.getByRole('button', { name: '승인 요청', exact: true });
      if (await isVisible(requestAssigneeButton)) {
        await expect(page.getByPlaceholder('변경 사유 (선택)')).toBeVisible();
      }

      const resourceType = page.getByRole('group', { name: '자료 유형' });
      await expect(resourceType).toBeVisible();
      await resourceType.getByRole('button', { name: '파일 첨부', exact: true }).click();
      await expect(page.getByLabel('첨부 파일')).toBeVisible();
      await resourceType.getByRole('button', { name: '외부 링크', exact: true }).click();
      await expect(page.getByPlaceholder(/GitHub, Notion/)).toBeVisible();

      const checklistText = requiredEnv('E2E_CHECKLIST_ITEM_TEXT');
      const checklistItem = page.getByRole('checkbox', { name: new RegExp(escapeRegExp(checklistText)) });
      await expect(checklistItem).toBeVisible();
      const checklistRow = checklistItem.locator('xpath=../..');
      await expect(checklistRow.getByRole('button', { name: '수정', exact: true })).toBeVisible();
      await expect(checklistRow.getByRole('button', { name: '삭제', exact: true })).toBeVisible();

      const commentText = requiredEnv('E2E_COMMENT_TEXT');
      const comment = page.getByRole('article').filter({ hasText: commentText });
      await expect(comment).toHaveCount(1);
      await expect(comment.getByRole('button', { name: '수정', exact: true })).toBeVisible();
      await expect(comment.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
      await comment.getByRole('button', { name: '수정', exact: true }).click();
      await expect(comment.getByRole('textbox')).toBeVisible();
      await comment.getByRole('button', { name: '취소', exact: true }).click();

      const resourceTitle = requiredEnv('E2E_RESOURCE_TITLE');
      const resource = page.getByRole('article').filter({ has: page.getByText(resourceTitle, { exact: true }) });
      await expect(resource).toHaveCount(1);
      const resourceOpen = resource.getByRole('link', { name: '열기', exact: true });
      const resourceDownload = resource.getByRole('button', { name: '다운로드', exact: true });
      if (await resourceOpen.count() === 0 && await resourceDownload.count() === 0) {
        throw new Error(`E2E_RESOURCE_TITLE=${resourceTitle} has no visible open/download control.`);
      }
      await expect(resource.getByRole('button', { name: '삭제', exact: true })).toBeVisible();

      await previewConfiguredTaskActions(page, group, 'E2E_TASK_REQUESTED_TITLE', ['요청 승인', '요청 반려', '업무 취소'], ['요청 반려', '업무 취소']);
      await previewConfiguredTaskActions(page, group, 'E2E_TASK_TODO_TITLE', ['업무 시작']);
      await previewConfiguredTaskActions(page, group, 'E2E_TASK_IN_PROGRESS_TITLE', ['업무 보류', '업무 완료'], ['업무 보류']);
      await previewConfiguredTaskActions(page, group, 'E2E_TASK_ON_HOLD_TITLE', ['업무 재개']);
      await previewConfiguredTaskActions(page, group, 'E2E_TASK_COMPLETED_TITLE', ['완료 업무 재개']);
      await pause(page, 2_200);
    });

    await test.step('05 · Projects, topics, action items, project files, and urgent issues', async () => {
      const projectList = await previewConfiguredProjectList(page, group);
      const createProject = page.getByRole('button', { name: /프로젝트 만들기/ });
      await expect(createProject).toBeVisible();
      await createProject.click();
      const projectDialog = page.getByRole('dialog', { name: '새 프로젝트' });
      await expect(projectDialog).toBeVisible();
      await expect(projectDialog.getByLabel('프로젝트 이름')).toBeVisible();
      await expect(projectDialog.getByLabel('설명')).toBeVisible();
      await expect(projectDialog.getByLabel('프로젝트 리더')).toBeVisible();
      await expect(projectDialog.getByLabel('시작일')).toBeVisible();
      await expect(projectDialog.getByLabel('종료일')).toBeVisible();
      await closeModal(page);

      const editProject = projectList.row.getByRole('button', { name: '수정', exact: true });
      await expect(editProject).toBeVisible();
      if (await isVisible(editProject)) {
        await editProject.click();
        const editProjectDialog = page.getByRole('dialog', { name: '프로젝트 수정' });
        await expect(editProjectDialog).toBeVisible();
        await expect(editProjectDialog.getByLabel('프로젝트 이름')).toBeVisible();
        await expect(editProjectDialog.getByLabel('상태')).toBeVisible();
        await closeModal(page);
      }

      const project = await openConfiguredProject(page, group);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const filesButton = page.getByRole('button', { name: /파일·링크/ });
      await expect(filesButton).toBeVisible();
      await filesButton.click();
      await expect(page.getByRole('heading', { name: '프로젝트 파일 시스템', level: 2 })).toBeVisible();
      const projectFolders = page.getByRole('navigation', { name: '프로젝트 폴더' });
      await expect(projectFolders).toBeVisible();
      const projectRoot = projectFolders.getByRole('button', { name: new RegExp(escapeRegExp(project.name)) });
      await expect(projectRoot).toBeVisible();
      await projectRoot.click();
      const addLink = page.getByRole('button', { name: /^＋ 링크$/ });
      await expect(addLink).toBeVisible();
      await addLink.click();
      const linkDialog = page.getByRole('dialog', { name: '링크 등록' });
      await expect(linkDialog).toBeVisible();
      await expect(linkDialog.getByLabel('자료 제목')).toBeVisible();
      await expect(linkDialog.getByLabel('HTTPS URL')).toBeVisible();
      await closeModal(page);
      const addFile = page.getByRole('button', { name: /^＋ 파일$/ });
      await expect(addFile).toBeVisible();
      await addFile.click();
      const fileDialog = page.getByRole('dialog', { name: '파일 올리기' });
      await expect(fileDialog).toBeVisible();
      await expect(fileDialog.getByLabel('파일')).toBeVisible();
      await closeModal(page);
      await filesButton.click();
      await expect(page.getByRole('button', { name: /주제 추가/ })).toBeVisible();

      const legacySummary = page.getByText(/기존 .*내용/);
      await expect(legacySummary).toBeVisible();
      await legacySummary.click();
      await expect(page.getByRole('button', { name: /실행 항목/ })).toBeVisible();

      const flowEdits = await page.getByRole('button', { name: '수정', exact: true }).all();
      if (flowEdits.length === 0) throw new Error('The configured live project has no editable topic/detail/action-item surface. Prepare a project with existing project nodes.');
      for (const edit of flowEdits) {
        await edit.click();
        const nodeDialog = page.getByRole('dialog');
        await expect(nodeDialog).toBeVisible();
        await expect(nodeDialog.getByLabel('주제')).toBeVisible();
        await expect(nodeDialog.getByLabel('설명')).toBeVisible();
        await expect(nodeDialog.getByLabel(/담당자/)).toBeVisible();
        await expect(nodeDialog.getByLabel('마감일')).toBeVisible();
        await closeModal(page);
      }

      const addTopic = page.getByRole('button', { name: /주제 추가/ });
      await expect(addTopic).toBeVisible();
      await addTopic.click();
      const topicDialog = page.getByRole('dialog');
      await expect(topicDialog).toBeVisible();
      await expect(topicDialog.getByLabel('주제')).toBeVisible();
      await expect(topicDialog.getByLabel('설명')).toBeVisible();
      await expect(topicDialog.getByLabel(/담당자/)).toBeVisible();
      await closeModal(page);
      const addIssue = await firstVisible(page.getByRole('button', { name: /^＋\s*실행 항목$/ }));
      if (!addIssue) throw new Error('The configured live project has no visible action-item button. Prepare an existing project detail node.');
      await addIssue.click();
      const issueDialog = page.getByRole('dialog');
      await expect(issueDialog).toBeVisible();
      await expect(issueDialog.getByLabel('주제')).toBeVisible();
      await expect(issueDialog.getByLabel('설명')).toBeVisible();
      await expect(issueDialog.getByLabel(/담당자/)).toBeVisible();
      await expect(issueDialog.getByLabel('마감일')).toBeVisible();
      await closeModal(page);
      await previewConfiguredProjectIssueControls(page);

      await visit(page, group.filesPath, /파일 시스템/);
      await expect(page.getByRole('navigation', { name: '그룹 폴더' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '그룹 자료', level: 2 })).toBeVisible();
      const resourceTypes = page.getByRole('group', { name: '자료 유형' });
      await expect(resourceTypes).toBeVisible();
      await resourceTypes.getByRole('button', { name: '파일 첨부', exact: true }).click();
      await expect(page.getByLabel('첨부 파일')).toBeVisible();
      await resourceTypes.getByRole('button', { name: '외부 링크', exact: true }).click();
      await expect(page.getByPlaceholder(/GitHub, Notion/)).toBeVisible();
      const groupProjectRoot = page.getByRole('navigation', { name: '그룹 폴더' }).getByRole('button', { name: new RegExp(escapeRegExp(project.name)) });
      await expect(groupProjectRoot).toBeVisible();
      await groupProjectRoot.click();
      await expect(page.getByRole('heading', { name: '프로젝트 파일 시스템', level: 2 })).toBeVisible();
      await expect(page.getByRole('navigation', { name: '프로젝트 폴더' })).toBeVisible();
      await previewConfiguredProjectDocument(page);
      await pause(page, 1_200);

      await visit(page, `/groups/${group.id}/emergency-issues`, '긴급 이슈 관리');
      await expect(page.getByRole('heading', { name: '긴급 이슈 목록', level: 2 })).toBeVisible();
      await page.getByRole('tab', { name: /해결/ }).click();
      await page.getByRole('tab', { name: /열린|미해결/ }).click();
      await page.getByRole('button', { name: /긴급 이슈 추가/ }).click();
      const emergencyDialog = page.getByRole('dialog', { name: '긴급 이슈 추가' });
      await expect(emergencyDialog).toBeVisible();
      await expect(emergencyDialog.getByLabel('프로젝트')).toBeVisible();
      await expect(emergencyDialog.getByLabel('알림 대상')).toBeVisible();
      await expect(emergencyDialog.getByPlaceholder('무슨 문제가 발생했나요?')).toBeVisible();
      await expect(emergencyDialog.getByLabel('자세한 내용')).toBeVisible();
      await expect(emergencyDialog.getByLabel(/이미지/)).toBeVisible();
      await closeModal(page);
      await previewConfiguredEmergencyIssues(page, group);
      await pause(page, 2_000);
    });

    await test.step('06 · Team chat, files, calendar, and notifications', async () => {
      await visit(page, '/chat', '채팅');
      await expect(page.getByRole('complementary', { name: '채팅 그룹' })).toBeVisible();
      await openConfiguredChannel(page, group);
      const channelPanel = page.getByRole('complementary').filter({
        has: page.getByRole('heading', { name: group.name, level: 2 }),
      });
      const newChannel = channelPanel.getByRole('button', { name: '＋', exact: true });
      if (await isVisible(newChannel)) {
        await newChannel.click();
        const channelDialog = page.getByRole('dialog', { name: '새 채팅방' });
        await expect(channelDialog).toBeVisible();
        await expect(channelDialog.getByLabel('채팅방 이름')).toBeVisible();
        await expect(channelDialog.getByLabel('프로젝트')).toBeVisible();
        const channelProject = channelDialog.getByLabel('프로젝트');
        const projectOptions = await channelProject.getByRole('option').all();
        if (projectOptions.length > 1) {
          await channelProject.selectOption({ index: 1 });
          await expect(channelDialog.getByLabel('연결할 주제')).toBeVisible();
        }
        await closeModal(page);
      }
      await expect(page.getByRole('heading', { name: '팀 채팅', level: 1 })).toBeVisible();
      await expect(page.getByPlaceholder('메시지를 입력하세요')).toBeVisible();
      await expect(page.getByTitle('파일 또는 이미지 첨부')).toBeVisible();
      await clickIfVisible(page.getByRole('button', { name: '이전 메시지 불러오기', exact: true }));
      await pause(page, 1_800);

      await visit(page, '/calendar', '캘린더');
      await page.getByRole('button', { name: '다음 달', exact: true }).click();
      await page.getByRole('button', { name: '이전 달', exact: true }).click();
      await page.getByRole('button', { name: '오늘', exact: true }).click();
      await page.getByPlaceholder('일정·업무 검색').fill(group.name);
      await page.getByPlaceholder('일정·업무 검색').fill('');
      const calendarGroup = page.getByLabel('그룹');
      if (await calendarGroup.getByRole('option', { name: group.name, exact: true }).count() > 0) await calendarGroup.selectOption({ label: group.name });
      await page.getByLabel('담당자').selectOption('me');
      await page.getByLabel('담당자').selectOption('');

      const addCalendarEvent = await firstVisible(page.getByRole('button', { name: '일정 추가', exact: true }));
      if (!addCalendarEvent) throw new Error('The live calendar has no visible add-event control.');
      await addCalendarEvent.click();
      const eventDialog = page.getByRole('dialog', { name: '새 일정 추가' });
      await expect(eventDialog).toBeVisible();
      await expect(eventDialog.getByLabel('그룹')).toBeVisible();
      await expect(eventDialog.getByLabel('유형')).toBeVisible();
      const eventType = eventDialog.getByLabel('유형');
      for (const eventTypeValue of ['SCHEDULE', 'MEETING', 'VACATION', 'TODO']) {
        await eventType.selectOption(eventTypeValue);
        await pause(page, 500);
      }
      await expect(eventDialog.getByLabel('제목')).toBeVisible();
      await expect(eventDialog.getByLabel('종일 일정')).toBeVisible();
      await expect(eventDialog.getByLabel('시작 날짜·시간')).toBeVisible();
      await expect(eventDialog.getByLabel('종료 날짜·시간')).toBeVisible();
      await expect(eventDialog.getByLabel('장소 (선택)')).toBeVisible();
      await expect(eventDialog.getByLabel('메모 (선택)')).toBeVisible();
      await eventDialog.getByLabel('종일 일정').check();
      await expect(eventDialog.getByLabel('날짜')).toBeVisible();
      await eventDialog.getByLabel('종일 일정').uncheck();
      await expect(eventDialog.getByLabel('시작 날짜·시간')).toBeVisible();
      await expect(eventDialog.getByLabel('종료 날짜·시간')).toBeVisible();
      await closeModal(page);

      await page.getByRole('button', { name: '일정 가져오기', exact: true }).click();
      const importDialog = page.getByRole('dialog', { name: '일정 가져오기' });
      await expect(importDialog).toBeVisible();
      await expect(importDialog.getByLabel('가져올 그룹')).toBeVisible();
      await expect(importDialog.getByLabel('ICS 파일 선택')).toBeVisible();
      await closeModal(page);

      await openConfiguredCalendarItem(page, true);
      const detailDialog = page.getByRole('dialog');
      await expect(detailDialog).toBeVisible();
      const editEvent = detailDialog.getByRole('button', { name: '편집하기', exact: true });
      await expect(editEvent).toBeVisible();
      await editEvent.click();
      const editEventDialog = page.getByRole('dialog', { name: '일정 편집' });
      await expect(editEventDialog).toBeVisible();
      await expect(editEventDialog.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
      await expect(editEventDialog.getByLabel('제목')).toBeVisible();
      await closeModal(page);
      await pause(page, 2_000);

      await visit(page, '/notifications', '알림');
      await expect(page.getByRole('heading', { name: '최근 알림', level: 2 })).toBeVisible();
      await page.getByRole('button', { name: /^전체/ }).click();
      await page.getByRole('button', { name: /^안 읽음/ }).click();
      await page.getByRole('button', { name: /^읽음/ }).click();
      await page.getByRole('button', { name: /^전체/ }).click();
      const notificationGroup = page.getByLabel('그룹');
      if (await notificationGroup.getByRole('option', { name: group.name, exact: true }).count() > 0) await notificationGroup.selectOption({ label: group.name });
      await notificationGroup.selectOption('');
      await clickIfVisible(page.getByRole('button', { name: /이전 알림 더 보기/ }));
      await expect(page.getByRole('button', { name: /모두 읽음/ })).toBeVisible();
      const allowPush = page.getByRole('button', { name: '알림 허용', exact: true });
      if (await isVisible(allowPush)) {
        await expect(page.getByText(/알림을 허용하면/)).toBeVisible();
      }
      await previewConfiguredNotification(page);
      await pause(page, 2_000);
    });

    await test.step('07 · AI assistant, RAG entry point, and report controls', async () => {
      await visit(page, '/assistant', '업무 비서');
      const workspace = page.getByLabel('작업할 그룹');
      await expect(workspace).toBeVisible();
      await workspace.selectOption({ label: group.name });
      await expect(page.getByRole('button', { name: '자료 재색인', exact: true })).toBeVisible();
      const quickPrompts = [
        '이번 주 마감 임박 업무를 정리해줘',
        '배포 점검 업무와 체크리스트를 만들어줘',
        '진행 중인 업무의 막힌 지점을 알려줘',
      ];
      for (const prompt of quickPrompts) {
        const quickPrompt = page.getByRole('button', { name: prompt, exact: true });
        await expect(quickPrompt).toBeVisible();
        await quickPrompt.click();
        await pause(page, 500);
      }
      const assistantComposer = page.getByPlaceholder(/배포 점검 업무/);
      await expect(assistantComposer).toBeVisible();
      await assistantComposer.fill('');
      if (allowRagReindex()) {
        await page.getByRole('button', { name: '자료 재색인', exact: true }).click();
        await expect(page.getByRole('region', { name: 'AI 비서 대화' }).getByText(/색인|Indexed|자료를/).last()).toBeVisible({ timeout: 60_000 });
      }
      if (allowAiCalls()) {
        await page.getByRole('button', { name: quickPrompts[0], exact: true }).click();
        await page.getByRole('button', { name: '보내기', exact: true }).click();
        const assistantRegion = page.getByRole('region', { name: 'AI 비서 대화' });
        await expect(assistantRegion).toBeVisible();
        await expect.poll(() => assistantRegion.locator('article').count(), { timeout: 120_000 }).toBeGreaterThan(1);
      }
      await previewConfiguredAssistantPendingAction(page);
      await previewConfiguredAssistantPolicy(page);
      await pause(page, 2_500);
    });

    await test.step('08 · Profile and account security', async () => {
      await visit(page, '/profile', '프로필');
      await expect(page.getByLabel('닉네임')).toBeVisible();
      await expect(page.getByLabel('전화번호')).toBeVisible();
      await expect(page.getByText('새 프로필 이미지 선택', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '저장', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
      await page.getByRole('link', { name: /계정 및 보안 설정/ }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole('heading', { name: '로그인된 기기', level: 2 })).toBeVisible();
      await expect(page.getByLabel('현재 비밀번호')).toBeVisible();
      await expect(page.getByLabel('새 비밀번호')).toBeVisible();
      await expect(page.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeVisible();
      await expect(page.getByRole('article').getByRole('button', { name: '로그아웃', exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: '모든 기기에서 로그아웃', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '회원 탈퇴', level: 2 })).toBeVisible();
      await expect(page.getByLabel(/현재 비밀번호\(소셜 계정은 비워 둠\)/)).toBeVisible();
      await expect(page.getByRole('button', { name: '회원 탈퇴', exact: true })).toBeVisible();
      await pause(page, 2_000);

      await page.goto('/profile', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: '프로필', level: 1 })).toBeVisible();
      await resetClientSession(page);
    });

    await test.step('09 · Administrator operations, security, reports, and monitoring', async () => {
      if (await previewConfiguredAdminMfaSetup(page)) await resetClientSession(page);
      await loginAsAdmin(page);
      await previewAdminOverview(page);
      await expect(page.getByRole('heading', { name: /Admin$/, level: 1 })).toBeVisible();
      await expect(page.getByRole('region', { name: '운영 현황 요약' })).toBeVisible();
      await pause(page, 1_800);

      const unifiedView = page.getByRole('button', { name: '통합 화면', exact: true });
      if (await isVisible(unifiedView)) {
        await unifiedView.click();
        await expect(page.getByRole('heading', { name: '사용자 관리', level: 2 })).toBeVisible();
        await expect(page.getByRole('heading', { name: '업무 관리', level: 2 })).toBeVisible();
        await pause(page, 1_800);
      }
      await ensureAdminTabs(page);

      await previewConfiguredAdminUsers(page);
      await pause(page, 1_800);

      await previewConfiguredAdminTasks(page);
      await pause(page, 1_800);

      await visitAdminTab(page, '리포트', '리포트 다운로드 현황');
      await expect(page.getByRole('heading', { name: '예약 리포트 발송 현황', level: 2 })).toBeVisible();
      await visitAdminTab(page, '모니터링', '시스템 사용량');
      await expect(page.getByText('CPU', { exact: true })).toBeVisible();
      await expect(page.getByText('메모리', { exact: true })).toBeVisible();
      await expect(page.getByText('저장소', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '스토리지 연동 설정', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'AI 사용량', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'AI 호출 세부', level: 2 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'NAS 연결 테스트 및 전환', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '로컬로 되돌리기', exact: true })).toBeVisible();
      await expect(page.getByText(/현재 방식/)).toBeVisible();
      await expect(page.getByText(/NAS 경로/)).toBeVisible();

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
        await expect(page.getByRole('heading', { name: 'AI 비서', level: 3 })).toBeVisible({ timeout: 120_000 });
      }
      await pause(page, 2_000);
    });

    await test.step('10 · Organization branding, notices, login history, and audit trail', async () => {
      await visitAdminTab(page, '브랜딩', '로고 · 서비스 이름');
      await expect(page.getByLabel('조직/서비스 이름')).toBeVisible();
      await expect(page.getByLabel(/로고 이미지/)).toBeVisible();
      await expect(page.getByRole('button', { name: '저장', exact: true })).toBeVisible();
      await pause(page, 1_500);

      await previewConfiguredPendingNotice(page);
      await pause(page, 1_500);

      await visitAdminTab(page, '로그인 이력', '로그인 이력');
      await expect(page.getByRole('table')).toBeVisible();
      await visitAdminTab(page, '감사 로그', '운영 감사로그');
      await expect(page.getByRole('table')).toBeVisible();
      await pause(page, 2_500);
    });
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
