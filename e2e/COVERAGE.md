# 촬영 범위와 구현 근거

`full-demo.spec.ts`는 가이드의 On-Premise 순서를 따르되, 현재 `frontend/src/app/App.tsx`에 실제 등록된 route와 각 화면의 실제 DOM을 기준으로 촬영한다. `chapters/`는 같은 범위를 부분 재촬영하기 위한 독립 시나리오다.

## 전체 영상 매핑

| 챕터 | 실제 route | 촬영하는 구현 기능 |
| --- | --- | --- |
| 00 | `/privacy`, `/terms` | 공개 개인정보 처리방침과 서비스 이용약관 |
| 01 | `/login`, `/app` | 회사 계정 로그인과 개인 홈 |
| 02 | `/groups`, `/groups/:groupId`, `/groups/:groupId/members`, `/group-invitations/accept` | 그룹 생성/참여 form, 기본·협업·리포트 설정, 멤버 검색/역할/내보내기 control, 이메일·기존 링크·기존 키 초대 관리와 실제 초대 수락 전 화면 |
| 03 | `/groups/:groupId/dashboard` | 기간 선택, 상태별 업무, 팀원 workload drill-down, 기본/AI 리포트 controls |
| 04 | `/groups/:groupId/tasks`, `/tasks/:taskId` | 업무 생성, 프로젝트·주제 연결, 업무 수정, 상태별 승인/시작/보류/완료/재개/재오픈 action, 사유 form, 담당자 지정·담당자 변경 승인/반려, 체크리스트·댓글·멘션·첨부 |
| 05 | `/groups/:groupId/projects`, `/projects/:projectId/flow`, `/groups/:groupId/files`, `/groups/:groupId/emergency-issues` | 프로젝트/주제/내용/실행 항목 form, 실행 항목 checklist·이미지 선택/삭제 control, 프로젝트·그룹 파일 트리, 링크/파일 form, 열린/해결 이슈와 해결/재오픈 action |
| 06 | `/chat`, `/groups/:groupId/chat`, `/calendar`, `/notifications` | 채팅 그룹·채널·채널 생성 form, 첨부 UI, 캘린더 필터/4가지 일정 유형/종일·시간형/ICS/detail/edit, 알림 필터·읽음 처리/삭제 control |
| 07 | `/assistant`, `/groups/:groupId/dashboard`, `/groups/:groupId?tab=plan` | AI 비서, 정책 제한 화면, 자료 재색인 진입점, 기존 pending action 확인/취소 control, 그룹 리포트 언어/일정, PDF controls |
| 08 | `/profile`, `/account` | 프로필과 계정 보안: 프로필 이미지 선택, 개별·전체 기기 세션 종료 control, 비밀번호 변경, 탈퇴 화면 |
| 09 | `/admin`, `/admin/users`, `/admin/tasks`, `/admin/reports`, `/admin/monitoring`, `/admin/ai-settings` | 관리자 MFA 최초 설정(별도 opt-in 계정), 통합/탭 전환, overview stat navigation, 지정된 기존 사용자·업무의 정지/복구/수정/재설정/삭제와 확인 modal, 리포트 추적, 모니터링·스토리지·AI 설정 |
| 10 | `/admin/branding`, `/admin/notices`, `/admin/login-history`, `/admin/audit-log` | 브랜딩, 공지 예약 form과 기존 대기 공지 취소 control, 로그인 이력, 운영 감사 로그 |

## 가이드와 실제 구현이 다른 항목

- `App.tsx`에 공개 회원가입, OAuth 전용 화면, 결제·구독 route가 없어 영상에 추가하지 않는다.
- On-Premise는 공개 회원가입 대신 회사 발급 계정 로그인과 관리자 사원 등록 화면을 보여준다.
- 최초 비밀번호 변경은 서버가 `passwordChangeRequired`일 때 `/account`로 강제하는 실제 흐름이다. 기본 촬영은 준비 단계에서 변경을 완료한 계정을 사용하며, 폐기 가능한 실제 테스트 계정에 `E2E_ALLOW_INITIAL_PASSWORD_CHANGE=true`와 새 비밀번호를 주면 이 흐름도 영상에 포함한다.
- MFA 최초 QR 등록은 인증 앱이 필요하므로, 기본 전체 촬영은 이미 MFA가 활성화된 관리자 계정을 사용하고 로그인 시 MFA 입력 화면을 거친다. 별도 `E2E_ADMIN_SETUP_*` 계정과 `E2E_ALLOW_ADMIN_MFA_SETUP=true`를 지정한 경우에만 최초 설정을 실행한다.

## 실행 안전 범위

- 계정·그룹·업무·프로젝트·채팅방을 자동 생성하지 않는다. 지정한 기존 비운영 데이터를 찾지 못하면 실패한다.
- full demo는 상태별 업무 5개, 콘텐츠가 있는 업무 1개, 담당자 변경 pending 업무 1개, 체크리스트·이미지가 있는 프로젝트 실행 항목 1개, 열린/해결 긴급 이슈 각 1개, 활성 초대 링크·그룹 키, 캘린더 일정 1개, AI pending action과 정책 제한 그룹, 관리자 사용자·업무·공지 레코드를 환경변수로 지정해야 모든 action surface를 재생할 수 있다.
- 생성/수정/삭제/정지/복구/탈퇴/공지 발송/API key 저장/파일 업로드/메시지 전송은 제출하지 않고 form 또는 확인 화면까지만 보여준다.
- NAS 전환: 기본은 화면까지만(preview). 촬영 예외 — 폐기용 VM + `E2E_ALLOW_NAS_SWITCH=true` 일 때만 chapter 07 이 실제 `local -> nas_mount` 전환을 실행한다.
- 사용자 계정 전환도 서비스 logout API 대신 브라우저의 토큰·쿠키만 지워 서버 세션을 변경하지 않는다.
- PDF 다운로드와 AI 호출은 각각 `E2E_ALLOW_READONLY_ACTIONS=true`, `E2E_ALLOW_AI_CALLS=true`일 때만 실행한다.
