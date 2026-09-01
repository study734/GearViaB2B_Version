import {
  allowAiCalls,
  allowRagReindex,
  closeModal,
  expect,
  isVisible,
  loginAsUser,
  openConfiguredGroup,
  pause,
  previewConfiguredAssistantPendingAction,
  previewConfiguredAssistantPolicy,
  test,
  visit,
} from '../../support/live-test';

test('03 · AI 비서, RAG 진입점과 기본·AI 리포트', async ({ page }) => {
  await loginAsUser(page);
  const group = await openConfiguredGroup(page);

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
  const quickPrompt = page.getByRole('button', { name: quickPrompts[0], exact: true });
  if (await isVisible(quickPrompt)) {
    for (const prompt of quickPrompts) {
      await page.getByRole('button', { name: prompt, exact: true }).click();
    }
    await expect(page.getByPlaceholder(/배포 점검 업무/)).toBeVisible();
    if (allowRagReindex()) {
      await page.getByRole('button', { name: '자료 재색인', exact: true }).click();
      await expect(page.getByRole('region', { name: 'AI 비서 대화' }).getByText(/색인|Indexed|자료를/).last()).toBeVisible({ timeout: 60_000 });
    }
    if (allowAiCalls()) {
      await page.getByRole('button', { name: quickPrompts[0], exact: true }).click();
      await page.getByRole('button', { name: '보내기', exact: true }).click();
      await expect(page.getByRole('region', { name: 'AI 비서 대화' })).toBeVisible();
    }
    await previewConfiguredAssistantPendingAction(page);
    await previewConfiguredAssistantPolicy(page);
  } else {
    await expect(page.getByRole('heading', { name: /AI 비서는 관리자 정책/ })).toBeVisible();
  }
  await pause(page, 2_500);

  await visit(page, `${group.settingsPath}?tab=plan`, '그룹 설정');
  await expect(page.getByRole('heading', { name: '그룹 리포트', level: 2 })).toBeVisible();
  const reportLanguage = page.getByLabel('리포트 언어');
  if (await isVisible(reportLanguage)) {
    await expect(page.getByRole('heading', { name: '메일 리포트 일정', level: 3 })).toBeVisible();
    await expect(page.getByRole('button', { name: '메일 일정 저장', exact: true })).toBeVisible();
  }

  await visit(page, group.dashboardPath, new RegExp(`${escapeRegExp(group.name)} 대시보드`));
  const reportScope = page.getByLabel('범위');
  if (await isVisible(reportScope) && await reportScope.getByRole('option', { name: '그룹 전체', exact: true }).count() > 0) {
    await reportScope.selectOption({ label: '그룹 전체' });
    await expect(page.getByRole('button', { name: '한국어 다운로드', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'English download', exact: true })).toBeVisible();
    const aiButton = page.getByRole('button', { name: 'AI 리포트', exact: true });
    if (await isVisible(aiButton)) {
      await aiButton.click();
      const dialog = page.getByRole('dialog', { name: 'AI 리포트 언어 선택' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: '한국어 다운로드', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'English download', exact: true })).toBeVisible();
      await closeModal(page);
    }
  }
  await pause(page, 2_500);
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
