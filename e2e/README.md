# B2BGearVia Playwright 전체 시연 자동화

이 디렉터리는 발표용 Playwright 촬영 코드만 포함합니다. 애플리케이션 소스와 API 응답을 수정하지 않으며, 합성 데모 데이터도 사용하지 않습니다.

가이드 항목과 현재 실제 route의 대응표는 [`COVERAGE.md`](./COVERAGE.md)에 있습니다. 전체 영상은 구현된 기능을 모두 순서대로 노출하고, 실제 기능이 없는 가이드 항목은 근거와 함께 제외합니다.

## 핵심 원칙

- 실행 모드는 `live` 하나만 허용합니다.
- `E2E_BASE_URL`이 운영 주소가 아닌지 확인한 뒤 `E2E_LIVE_CONFIRMED=true`를 설정해야 합니다.
- 계정·그룹·업무·프로젝트·채팅방은 이미 존재하는 비운영 환경의 데이터를 화면에서 찾아 사용합니다.
- 지정한 데이터가 없으면 새 계정이나 데이터를 만들지 않고 실패합니다.
- `page.route()`, API mocking, 하드코딩된 데이터 ID, `backend/scripts/seed-demo-data.sh`, `backend/scripts/sql/demo-data.sql`을 사용하지 않습니다.
- CSS `nth-child`와 위치 의존 selector를 사용하지 않고 실제 UI의 role, label, placeholder, link route를 기준으로 선택합니다.
- 기본 촬영은 조회, 화면 전환, 로컬 폼 미리보기와 취소까지만 수행합니다. 삭제·정지·탈퇴·세션 종료·공지 발송·NAS 전환·API key 저장·파일 업로드·메시지 전송은 실행하지 않습니다.

## 실제 구현 기준 촬영 범위

가이드의 기능 목록을 그대로 가정하지 않고 현재 React route와 컴포넌트의 실제 DOM을 확인해 다음 범위를 촬영합니다.

### 일반 사용자

- 로그인과 최초 비밀번호 변경으로 이어지는 계정 진입 흐름, 개인 대시보드
- 그룹 목록, 새 그룹 form, 그룹 키 참여 form
- 팀 그룹 기본 설정, 협업 설정, 멤버 검색·역할 표시, 이메일/링크/그룹 키 초대 화면
- 그룹 대시보드 기간 선택, 상태별 업무 drill-down, 팀원별 workload drill-down
- 업무 생성 form: 프로젝트·주제·제목·설명·우선순위·마감·체크리스트 초안
- 업무 상세: 프로젝트 연결, 업무 수정 form, 상태 이력, 상태 변경 사유/보류 유형/다음 조치/확인일, 담당자 영역, 체크리스트, 댓글·멘션, 첨부 자료
- 프로젝트 목록의 펼치기와 주제별 업무, 프로젝트 생성 form, 프로젝트 flow의 주제·내용·실행 항목 form
- 프로젝트·그룹 파일 시스템의 폴더 탐색, 링크 등록, 파일 선택 UI
- 긴급 이슈의 열린/해결됨 필터와 프로젝트·대상·제목·상세·이미지 form
- 채팅 그룹/채널 탐색, 이전 메시지, 메시지 입력·첨부 UI, 채널 생성 form
- 캘린더 월 이동, 오늘, 검색, 그룹/담당자 필터, 일정 form, 종일 일정, ICS import, 기존 일정 detail/edit 화면
- 알림 전체/안 읽음/읽음·그룹 필터와 이전 알림 더 보기
- AI 비서 workspace, 빠른 요청, 자료 재색인 진입점, 그룹 리포트의 기본 PDF·AI 리포트 언어 선택
- 프로필과 계정 보안: 세션 목록, 비밀번호 변경, 모든 기기 로그아웃, 탈퇴 화면

### 관리자

- 운영 현황 요약과 그룹 현황
- 사용자 등록 form, 사용자 수정 modal, 삭제 확인 modal, 정지/복구/비밀번호 재설정 action 표시
- 업무 조회, 정지 사유 modal, 삭제 확인 modal, 복구/재개 action 표시
- 기본/예약 리포트 추적, 모니터링 CPU·메모리·저장소·AI usage
- 로컬/NAS storage 상태와 전환 controls
- AI provider 상태·모델·API key·기능별 활성화·연결 테스트 화면
- 조직명·로고 branding form, 전체 팀장 공지 제목·내용·예약일시 form
- 로그인 이력과 운영 감사 로그
- 관리자 통합 화면/탭 화면 전환

## 구현하지 않은 항목

현재 `frontend/src/app/App.tsx`의 route와 실제 화면에서 확인되지 않은 공개 회원가입, OAuth 전용 화면, 결제·구독 화면은 시연하지 않습니다. On-Premise의 “공개 회원가입 없음” 특성은 회사가 발급한 계정으로 로그인하는 화면과 관리자 계정 등록 화면으로만 확인합니다. 기능이 없는 화면을 영상에서 만들어 내지 않습니다.

## 데이터 준비

촬영 코드는 데이터를 생성하지 않습니다. 비운영 로컬/스테이징 서버에 다음을 수동으로 준비합니다.

촬영에 사용하는 백엔드는 `DEMO_ENABLED=false`로 실행해 읽기 전용 데모 세션 진입점도 끕니다. `backend/scripts/seed-demo-data.sh`와 `backend/scripts/sql/demo-data.sql`은 실행하지 않습니다.

1. 일반 계정과 관리자 계정을 만들고 최초 비밀번호 변경을 완료합니다.
2. 관리자 MFA를 설정하고 촬영 시점에 사용할 코드를 준비합니다.
3. 일반 계정이 접근 가능한 `TEAM` 그룹을 준비합니다.
4. 업무 상세를 풍부하게 보이게 하려면 해당 그룹에 업무, 체크리스트, 댓글, 멘션 가능한 멤버, 담당자와 상태 이력을 준비합니다.
5. 상태별 업무 action을 확인하려면 같은 그룹에 다음 기존 업무를 준비합니다. 요청 승인/반려/취소가 가능한 `REQUESTED`, 시작 가능한 담당 업무 `TODO`, 보류/완료가 가능한 담당 업무 `IN_PROGRESS`, 재개 가능한 `ON_HOLD`, 재개 가능한 `COMPLETED` 업무를 각각 지정합니다.
6. 프로젝트와 주제/내용/실행 항목, 그룹 채팅방을 준비합니다. 프로젝트 파일 시스템의 그룹 폴더와 프로젝트 폴더 양쪽에 접근할 수 있어야 합니다.
   프로젝트 flow의 실행 항목 중 하나는 `E2E_PROJECT_ISSUE_TITLE`로 지정하고, 체크리스트와 기존 이미지도 준비합니다. 영상은 체크리스트 토글/추가 입력, 이미지 선택·삭제 control까지 보여주지만 제출하지 않습니다.
7. 열린 긴급 이슈와 해결된 긴급 이슈를 각각 준비해 상태 action을 확인합니다. action은 실제 해결/재오픈을 제출하지 않고 버튼만 보여줍니다.
8. 캘린더 detail/edit까지 촬영하려면 현재 촬영 월에 기존 일정 제목을 준비하고 `E2E_CALENDAR_EVENT_TITLE`에 지정합니다.
9. 담당자 변경 요청/승인 control까지 촬영하려면 활성 업무 1개에 기존 pending 담당자 변경 요청을 준비하고 `E2E_TASK_ASSIGNMENT_APPROVAL_TITLE`로 지정합니다. 승인/반려 버튼은 표시만 하고 누르지 않습니다.
10. 초대 링크와 그룹 키 control까지 촬영하려면 그룹에 이미 활성화된 비운영 초대 링크와 그룹 키를 준비합니다. 링크 생성·복사·중지와 키 재발급·삭제는 서버 상태/비밀정보에 영향을 주므로 촬영 코드가 만들거나 회수하지 않습니다.
11. AI 비서가 활성화된 팀장 그룹에는 기존 pending action을 준비하고 `E2E_ASSISTANT_PENDING_ACTION_SUMMARY`로 지정합니다. 확인/취소 버튼은 표시만 합니다. 같은 사용자가 팀원인 별도 팀 그룹은 `E2E_ASSISTANT_DISABLED_GROUP_NAME`으로 지정해 정책 제한 화면을 촬영합니다.
12. 관리자 화면까지 촬영하려면 관리자 MFA가 이미 활성화된 관리자 계정과 함께, 활성 사용자 1명·정지 사용자 1명, 정지 가능한 업무 1개·보류 상태 업무 1개·최근 삭제 업무 1개, 취소 가능한 예약 공지 1개를 준비합니다. 이 레코드들의 제목/이름은 아래 환경변수로 지정합니다.

데이터가 부족해도 harness가 임의의 대체 계정·그룹·업무·프로젝트·채팅방을 만들지 않습니다. 목록에 지정 항목이 없으면 오류로 중단하는 것이 의도된 동작입니다.

## 환경변수

PowerShell 예시:

```powershell
$env:E2E_MODE = 'live'
$env:E2E_LIVE_CONFIRMED = 'true'
$env:DEMO_ENABLED = 'false'
$env:E2E_BASE_URL = 'http://127.0.0.1:5174'
$env:E2E_USER = '실제 테스트 사용자 ID 또는 회사 메일'
$env:E2E_PASSWORD = '실제 테스트 사용자 비밀번호'
$env:E2E_USER_NEW_PASSWORD = '선택: 최초 비밀번호 변경을 자동 촬영할 때 사용할 새 비밀번호'
$env:E2E_ADMIN_USER = '실제 관리자 ID 또는 회사 메일'
$env:E2E_ADMIN_PASSWORD = '실제 관리자 비밀번호'
$env:E2E_ADMIN_NEW_PASSWORD = '선택: 관리자 최초 비밀번호 변경을 자동 촬영할 때 사용할 새 비밀번호'
$env:E2E_ADMIN_MFA_CODE = '필요한 경우 촬영 시점의 6자리 코드'
$env:E2E_GROUP_NAME = '실제 팀 그룹 이름'
$env:E2E_TASK_TITLE = '실제 촬영 대상 업무 제목'
$env:E2E_TASK_REQUESTED_TITLE = '기존 REQUESTED 업무 제목'
$env:E2E_TASK_TODO_TITLE = '기존 TODO 업무 제목'
$env:E2E_TASK_IN_PROGRESS_TITLE = '기존 IN_PROGRESS 업무 제목'
$env:E2E_TASK_ON_HOLD_TITLE = '기존 ON_HOLD 업무 제목'
$env:E2E_TASK_COMPLETED_TITLE = '기존 COMPLETED 업무 제목'
$env:E2E_TASK_UNASSIGNED_TODO_TITLE = '기존 미담당 TODO 업무 제목'
$env:E2E_TASK_ASSIGNABLE_TITLE = '기존 담당자 지정 가능 업무 제목'
$env:E2E_TASK_ASSIGNMENT_APPROVAL_TITLE = '기존 pending 담당자 변경 요청이 있는 업무 제목'
$env:E2E_PROJECT_NAME = '실제 촬영 대상 프로젝트 이름'
$env:E2E_PROJECT_ISSUE_TITLE = '실제 촬영 대상 실행 항목 제목'
$env:E2E_PROJECT_RESOURCE_TITLE = '기존 프로젝트 자료 제목'
$env:E2E_CHANNEL_NAME = '실제 촬영 대상 채팅방 이름'
$env:E2E_CALENDAR_EVENT_TITLE = '선택: 기존 일정 제목'
$env:E2E_CHECKLIST_ITEM_TEXT = '기존 체크리스트 항목 텍스트'
$env:E2E_COMMENT_TEXT = '기존 댓글 텍스트'
$env:E2E_RESOURCE_TITLE = '기존 업무 자료 제목'
$env:E2E_OPEN_EMERGENCY_ISSUE_TITLE = '기존 열린 긴급 이슈 제목'
$env:E2E_RESOLVED_EMERGENCY_ISSUE_TITLE = '기존 해결된 긴급 이슈 제목'
$env:E2E_NOTIFICATION_TITLE = '기존 알림 제목'
$env:E2E_ASSISTANT_PENDING_ACTION_SUMMARY = '기존 AI pending action 요약 문구'
$env:E2E_ASSISTANT_DISABLED_GROUP_NAME = '사용자가 팀원이어서 AI 정책 제한이 보이는 팀 그룹 이름'
$env:E2E_ADMIN_SETUP_USER = '선택: MFA 최초 설정을 보여줄 폐기 가능한 비운영 관리자 ID'
$env:E2E_ADMIN_SETUP_PASSWORD = '선택: MFA 최초 설정 관리자 비밀번호'
$env:E2E_ADMIN_SETUP_MFA_CODE = '선택: MFA 최초 설정 직후 확인할 6자리 코드'
$env:E2E_ADMIN_ACTIVE_USER_NAME = '관리자 사용자 표의 활성 사용자 이름'
$env:E2E_ADMIN_SUSPENDED_USER_NAME = '관리자 사용자 표의 정지 사용자 이름'
$env:E2E_ADMIN_ACTIVE_TASK_TITLE = '관리자 업무 표의 정지 가능한 업무 제목'
$env:E2E_ADMIN_ON_HOLD_TASK_TITLE = '관리자 업무 표의 보류 업무 제목'
$env:E2E_ADMIN_DELETED_TASK_TITLE = '최근 삭제된 업무 표의 업무 제목'
$env:E2E_ADMIN_PENDING_NOTICE_TITLE = '공지 내역의 대기 중 공지 제목'
$env:E2E_PAUSE_MS = '1200'
$env:E2E_ALLOW_RAG_REINDEX = 'false'
$env:E2E_ALLOW_READONLY_ACTIONS = 'false'
$env:E2E_ALLOW_AI_CALLS = 'false'
$env:E2E_ALLOW_ADMIN_MFA_SETUP = 'false'
$env:E2E_SKIP_WEBSERVER = 'false'
$env:E2E_IGNORE_HTTPS_ERRORS = 'false'
```

업무와 프로젝트는 이름 대신 `E2E_TASK_ID`, `E2E_PROJECT_ID`를 사용할 수 있습니다. `E2E_GROUP_NAME`, `E2E_TASK_ID` 또는 `E2E_TASK_TITLE`, `E2E_PROJECT_ID` 또는 `E2E_PROJECT_NAME`, `E2E_CHANNEL_NAME` 및 위의 상태별·관리자·콘텐츠 환경변수는 full demo에서 필요한 기존 항목입니다. `E2E_CALENDAR_EVENT_TITLE`도 전체/협업 chapter에서는 기존 일정 detail/edit을 촬영하기 위해 필요합니다.

다음 값은 기본값이 `false`이며, 별도 비운영 환경에서 의도적으로 허용할 때만 설정합니다.

- `E2E_ALLOW_INITIAL_PASSWORD_CHANGE=true`: 최초 비밀번호가 아직 변경되지 않은 폐기 가능한 실제 테스트 계정에서만 1회 비밀번호 변경 화면을 자동 촬영
- `E2E_ALLOW_READONLY_ACTIONS=true`: 기본 PDF 다운로드처럼 서버에 다운로드/감사 기록을 남기는 읽기성 action 실행
- `E2E_ALLOW_RAG_REINDEX=true`: 선택한 그룹의 실제 자료 재색인 실행. 서버의 색인 상태가 바뀌므로 별도 비운영 환경에서만 허용
- `E2E_ALLOW_AI_CALLS=true`: AI 질문과 관리자 AI 연결 테스트 실행. 외부 API 비용·응답 시간·서버 사용량이 발생할 수 있습니다.
- `E2E_ALLOW_ADMIN_MFA_SETUP=true`: `E2E_ADMIN_SETUP_*` 계정의 MFA 설정/활성화를 실행해 QR·수동 secret·6자리 확인 화면을 촬영합니다. MFA가 활성화되는 영구 보안 변경이므로 폐기 가능한 비운영 관리자에서만 사용합니다.
- `E2E_ALLOW_NAS_SWITCH=true`: chapter 07 에서 실제 스토리지 provider 전환(`local -> nas_mount`)을 실행합니다. **On-Premise 시연 영상 전용 예외**로, 폐기 가능한 촬영용 VM 에서만 사용합니다. 공유·운영 유사 환경에서는 절대 켜지 마세요. 기본값(`false`)에서는 다른 관리자 action 과 동일하게 화면만 보여줍니다. 배경은 `ONPREM_VIDEO_PLAN.md` §7 참고.

계정, 비밀번호, MFA 코드와 API key는 저장소나 테스트 파일에 기록하지 않습니다. `E2E_ALLOW_NAS_SWITCH` 를 제외하면 이 harness 에는 관리자 destructive action 을 실제로 승인하는 환경변수가 없습니다.

## 실행

백엔드는 Playwright가 시작하지 않으므로 먼저 별도로 실행하고, 프론트엔드는 기본 설정에서 Playwright가 시작합니다.

```powershell
cd e2e
npm ci
npm run install:browsers
npm run record:full
```

프론트엔드 개발 서버가 이미 실행 중이면:

```powershell
$env:E2E_SKIP_WEBSERVER = 'true'
npm run record:full
```

부분 촬영:

```powershell
npm run record:chapter -- tests/chapters/02-collaboration.spec.ts
npm run record:chapter -- tests/chapters/03-ai.spec.ts
npm run record:chapter -- tests/chapters/08-monitoring.spec.ts
```

`video: 'on'`, `workers: 1`, `1920x1080`이 `playwright.config.ts`에 설정되어 있습니다. 일반 전환은 기본 1초, 핵심 결과는 1.5~2.5초의 pause를 둡니다.

결과:

- Playwright 결과: `e2e/output/test-results`
- HTML report: `e2e/output/report`
- 전체 발표용 영상: `e2e/output/presentation-videos/gearvia-onprem-full-demo.webm`

## 아직 자동화하기 어려운 기능

- 실데이터의 상태·권한에 따라 보이지 않는 업무 승인, 담당자 지정/변경 승인, 완료/재개 흐름
- 기존 데이터가 없는 환경에서의 파일/이미지 업로드와 채팅 첨부. 촬영 코드는 fixture 파일을 만들지 않습니다.
- AI 응답 품질·외부 provider 상태·RAG 재색인 결과. AI 호출은 명시적 opt-in일 때만 실행합니다.
- 관리자 MFA 최초 QR 등록은 실제 인증 앱과 촬영 시점의 6자리 코드가 필요합니다.
- 사용자 정지, 업무 삭제/정지/복구, 계정 탈퇴, 세션 종료, 공지 발송, API key 저장은 운영 영향 때문에 확인/입력 단계까지만 촬영합니다.
- NAS 전환도 기본은 화면까지만입니다. 단 On-Premise 시연 영상을 위해 `E2E_ALLOW_NAS_SWITCH=true` 를 폐기용 촬영 VM 에서 지정하면 chapter 07 이 실제 `local -> nas_mount` 전환을 실행합니다 (예외, 위 환경변수 절 참고).
- 브라우저 권한, Web Push 수신, 외부 링크의 실제 대상 화면은 환경·브라우저에 따라 달라 화면 내부 기능까지만 확인합니다.
