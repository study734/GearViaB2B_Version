import {
  closeModal,
  clickIfVisible,
  expect,
  firstVisible,
  isVisible,
  loginAsUser,
  openConfiguredCalendarItem,
  openConfiguredChannel,
  openConfiguredGroup,
  openConfiguredProject,
  openConfiguredTask,
  pause,
  previewConfiguredEmergencyIssues,
  previewConfiguredInvitationControls,
  previewConfiguredInvitation,
  previewConfiguredNotification,
  previewConfiguredProjectDocument,
  previewConfiguredProjectIssueControls,
  previewConfiguredProjectList,
  previewConfiguredTaskAssignment,
  previewConfiguredTaskAssignmentApproval,
  previewConfiguredTaskActions,
  previewConfiguredTaskClaim,
  previewTaskCreate,
  test,
  visit,
} from '../../support/live-test';

test('02 · 그룹, 멤버, 업무, 프로젝트와 협업 도구', async ({ page }) => {
  await loginAsUser(page);
  await visit(page, '/groups', '그룹');
  await expect(page.getByRole('button', { name: '새 그룹', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '그룹 키로 참여', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '새 그룹', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '새 그룹 만들기' })).toBeVisible();
  await closeModal(page);
  await page.getByRole('button', { name: '그룹 키로 참여', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '그룹 키로 참여' })).toBeVisible();
  await closeModal(page);

  const group = await openConfiguredGroup(page);
  await visit(page, group.settingsPath, '그룹 설정');
  await page.getByRole('button', { name: /^협업/ }).click();
  await expect(page.getByRole('heading', { name: '팀원 목록', level: 2 })).toBeVisible();
  if (await isVisible(page.getByRole('heading', { name: '멤버 초대', level: 2 }))) {
    await page.getByRole('button', { name: '이메일 초대', exact: true }).click();
    await expect(page.getByPlaceholder('초대할 이메일')).toBeVisible();
    await page.getByRole('button', { name: '초대 링크', exact: true }).click();
    await expect(page.getByText(/초대 링크 만들기|현재 사용 중인 초대 링크/)).toBeVisible();
    await pause(page, 800);
    await page.getByRole('button', { name: '그룹 키', exact: true }).click();
    await expect(page.getByText(/그룹 키|활성화되어 있습니다|활성화된 그룹 키가 없습니다/)).toBeVisible();
    await pause(page, 800);
  }
  await previewConfiguredInvitation(page);
  await previewConfiguredInvitationControls(page, group);
  await pause(page, 1_500);

  await visit(page, group.dashboardPath, new RegExp(`${escapeRegExp(group.name)} 대시보드`));
  await previewTaskCreate(page, '새 업무');
  await clickIfVisible(page.getByRole('button', { name: /^진행 중/ }));
  const memberMetric = page.getByRole('button', { name: /님의 .* 업무 보기$/ });
  if (await isVisible(memberMetric)) {
    const visibleMemberMetric = await firstVisible(memberMetric);
    if (visibleMemberMetric) await visibleMemberMetric.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await closeModal(page);
  }
  await pause(page, 1_500);

  await visit(page, group.tasksPath, new RegExp(`${escapeRegExp(group.name)} 업무`));
  await previewTaskCreate(page, '업무 만들기');
  await previewConfiguredTaskClaim(page, group);
  await previewConfiguredTaskAssignment(page, group);
  await previewConfiguredTaskAssignmentApproval(page, group);
  await openConfiguredTask(page, group);
  await expect(page.getByRole('heading', { name: '체크리스트', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '댓글', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '업무 첨부', level: 2 })).toBeVisible();
  await expect(page.getByLabel('새 댓글 내용')).toBeVisible();
  await expect(page.getByRole('group', { name: /멘션할 멤버/ })).toBeVisible();
  const statusReason = page.getByRole('button', { name: '업무 보류', exact: true });
  if (await isVisible(statusReason)) {
    await statusReason.click();
    await expect(page.getByRole('dialog').getByLabel('사유')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('보류 유형')).toBeVisible();
    await closeModal(page);
  }
  await previewConfiguredTaskActions(page, group, 'E2E_TASK_REQUESTED_TITLE', ['요청 승인', '요청 반려', '업무 취소'], ['요청 반려', '업무 취소']);
  await previewConfiguredTaskActions(page, group, 'E2E_TASK_TODO_TITLE', ['업무 시작']);
  await previewConfiguredTaskActions(page, group, 'E2E_TASK_IN_PROGRESS_TITLE', ['업무 보류', '업무 완료'], ['업무 보류']);
  await previewConfiguredTaskActions(page, group, 'E2E_TASK_ON_HOLD_TITLE', ['업무 재개']);
  await previewConfiguredTaskActions(page, group, 'E2E_TASK_COMPLETED_TITLE', ['완료 업무 재개']);
  await pause(page, 1_800);

  await previewConfiguredProjectList(page, group);
  const project = await openConfiguredProject(page, group);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const filesButton = page.getByRole('button', { name: /파일·링크/ });
  if (await isVisible(filesButton)) {
    await filesButton.click();
    await expect(page.getByRole('heading', { name: '프로젝트 파일 시스템', level: 2 })).toBeVisible();
    const addLink = page.getByRole('button', { name: /^＋ 링크$/ });
    if (await isVisible(addLink)) {
      await addLink.click();
      await expect(page.getByRole('dialog', { name: '링크 등록' })).toBeVisible();
      await closeModal(page);
    }
  }
  const addTopic = page.getByRole('button', { name: /주제 추가/ });
  if (await isVisible(addTopic)) {
    await addTopic.click();
    await expect(page.getByRole('dialog').getByLabel('주제')).toBeVisible();
    await closeModal(page);
  }

  const legacySummary = page.getByText(/기존 .*내용/);
  if (await isVisible(legacySummary)) {
    await legacySummary.click();
    const addIssue = await firstVisible(page.getByRole('button', { name: /^＋\s*실행 항목$/ }));
    if (!addIssue) throw new Error('The configured project has no action-item control. Prepare an existing project detail node.');
    await addIssue.click();
    const issueDialog = page.getByRole('dialog');
    await expect(issueDialog.getByLabel('주제')).toBeVisible();
    await expect(issueDialog.getByLabel('설명')).toBeVisible();
    await expect(issueDialog.getByLabel(/담당자/)).toBeVisible();
    await expect(issueDialog.getByLabel('마감일')).toBeVisible();
    await closeModal(page);
  }
  await previewConfiguredProjectIssueControls(page);

  await visit(page, group.filesPath, /파일 시스템/);
  await expect(page.getByRole('navigation', { name: '그룹 폴더' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '그룹 자료', level: 2 })).toBeVisible();
  const resourceTypes = page.getByRole('group', { name: '자료 유형' });
  if (await isVisible(resourceTypes)) {
    await resourceTypes.getByRole('button', { name: '파일 첨부', exact: true }).click();
    await expect(page.getByLabel('첨부 파일')).toBeVisible();
    await resourceTypes.getByRole('button', { name: '외부 링크', exact: true }).click();
    const projectRoot = page.getByRole('navigation', { name: '그룹 폴더' }).getByRole('button', { name: new RegExp(escapeRegExp(project.name)) });
    await expect(projectRoot).toBeVisible();
    await projectRoot.click();
    await expect(page.getByRole('heading', { name: '프로젝트 파일 시스템', level: 2 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '프로젝트 폴더' })).toBeVisible();
    await previewConfiguredProjectDocument(page);
  }

  await visit(page, `/groups/${group.id}/emergency-issues`, '긴급 이슈 관리');
  await expect(page.getByRole('heading', { name: '긴급 이슈 목록', level: 2 })).toBeVisible();
  await page.getByRole('tab', { name: /해결/ }).click();
  await page.getByRole('tab', { name: /열린|미해결/ }).click();
  await page.getByRole('button', { name: /긴급 이슈 추가/ }).click();
  const emergency = page.getByRole('dialog', { name: '긴급 이슈 추가' });
  await expect(emergency).toBeVisible();
  await expect(emergency.getByLabel('프로젝트')).toBeVisible();
  await expect(emergency.getByLabel('알림 대상')).toBeVisible();
  await expect(emergency.getByPlaceholder('무슨 문제가 발생했나요?')).toBeVisible();
  await expect(emergency.getByLabel('자세한 내용')).toBeVisible();
  await expect(emergency.getByLabel(/이미지/)).toBeVisible();
  await closeModal(page);
  await previewConfiguredEmergencyIssues(page, group);

  await visit(page, '/chat', '채팅');
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
    await closeModal(page);
  }
  await expect(page.getByPlaceholder('메시지를 입력하세요')).toBeVisible();
  await expect(page.getByTitle('파일 또는 이미지 첨부')).toBeVisible();
  await clickIfVisible(page.getByRole('button', { name: '이전 메시지 불러오기', exact: true }));
  await pause(page, 1_500);

  await visit(page, '/calendar', '캘린더');
  await page.getByRole('button', { name: '다음 달', exact: true }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByLabel('담당자').selectOption('me');
  await page.getByLabel('담당자').selectOption('');
  const addCalendarEvent = await firstVisible(page.getByRole('button', { name: '일정 추가', exact: true }));
  if (!addCalendarEvent) throw new Error('The live calendar has no visible add-event control.');
  await addCalendarEvent.click();
  const eventDialog = page.getByRole('dialog', { name: '새 일정 추가' });
  await expect(eventDialog).toBeVisible();
  await expect(eventDialog.getByLabel('그룹')).toBeVisible();
  const eventType = eventDialog.getByLabel('유형');
  for (const eventTypeValue of ['SCHEDULE', 'MEETING', 'VACATION', 'TODO']) {
    await eventType.selectOption(eventTypeValue);
    await pause(page, 500);
  }
  await expect(eventDialog.getByLabel('제목')).toBeVisible();
  await eventDialog.getByLabel('종일 일정').check();
  await expect(eventDialog.getByLabel('날짜')).toBeVisible();
  await eventDialog.getByLabel('종일 일정').uncheck();
  await expect(eventDialog.getByLabel('시작 날짜·시간')).toBeVisible();
  await expect(eventDialog.getByLabel('종료 날짜·시간')).toBeVisible();
  await expect(eventDialog.getByLabel('장소 (선택)')).toBeVisible();
  await expect(eventDialog.getByLabel('메모 (선택)')).toBeVisible();
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
  await detailDialog.getByRole('button', { name: '편집하기', exact: true }).click();
  const editEventDialog = page.getByRole('dialog', { name: '일정 편집' });
  await expect(editEventDialog).toBeVisible();
  await expect(editEventDialog.getByRole('button', { name: '삭제', exact: true })).toBeVisible();
  await expect(editEventDialog.getByLabel('제목')).toBeVisible();
  await closeModal(page);

  await visit(page, '/notifications', '알림');
  await page.getByRole('button', { name: /^안 읽음/ }).click();
  await page.getByRole('button', { name: /^읽음/ }).click();
  await page.getByRole('button', { name: /^전체/ }).click();
  const notificationGroup = page.getByLabel('그룹');
  if (await notificationGroup.getByRole('option', { name: group.name, exact: true }).count() > 0) await notificationGroup.selectOption({ label: group.name });
  await notificationGroup.selectOption('');
  await clickIfVisible(page.getByRole('button', { name: /이전 알림 더 보기/ }));
  await expect(page.getByRole('button', { name: /모두 읽음/ })).toBeVisible();
  await previewConfiguredNotification(page);
  const allowPush = page.getByRole('button', { name: '알림 허용', exact: true });
  if (await isVisible(allowPush)) await expect(page.getByText(/알림을 허용하면/)).toBeVisible();
  await pause(page, 1_800);
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
