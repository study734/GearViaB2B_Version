# GearVia 자동 설치 및 도메인·SSL — 인계

## 저장소와 브랜치

- 원격: `https://github.com/HO-0219/GearViaB2B_Version.git`
- 작업 위치: worktree `sixgill`, 브랜치 `study734/fetch-upstream-onprem-checkpoint`
  (`upstream/feat/gearvia-onprem-checkpoint-a` = `1a21d62` 위에 아래 커밋을 쌓음, 미푸시)
- 기준 커밋: `a9d6592 docs: record automated deployment verification`
- 구현 계획: `docs/superpowers/plans/2026-09-02-automated-ubuntu-install-domain-tls.md`
- 설계: `docs/superpowers/specs/2026-09-02-automated-ubuntu-install-domain-tls-design.md`

> 이 커밋들은 아직 `upstream/feat/gearvia-onprem-checkpoint-a`에 없다. 다음 세션은 이 브랜치를
> 기준으로 하거나 커밋을 해당 브랜치로 반영해야 한다.

## 진행 상태 — 계획 Task 1~10 전부 구현·검증 완료

| Task | 커밋 | 요약 |
|---|---|---|
| 1 무인자 설치 + runtime.env | `0f9a8c8` (upstream) | |
| 2 주소 감지 + 로컬 CA/서버 인증서 | `d5bdebc` (upstream) | |
| 3 Docker 이미지 자동 준비 + 제거 | `1a21d62` (upstream) + `d1b8afc` | `gearvia-images.sh`, `test-image-selection.sh` |
| (LF 고정) | `9466607` | `.gitattributes *.sh eol=lf`, `test-line-endings.sh` |
| 4 공개 URL 영속 + 동적 조회 | `59e2220` | `deployment_settings`(V7), `PublicUrlProvider` |
| 5 보안·WebSocket·메일 링크 동적 전환 | `e7076c3` | CORS/동일출처/WS/메일 링크가 `PublicUrlProvider` 사용 |
| 6 권한 제한 호스트 적용기 | `0949269` | `gearvia-host-apply.sh` + systemd `.path`/`.service`, HMAC, `test-host-apply.sh` |
| 7 도메인·SSL 관리자 API | `44eb8ee` | `/api/v1/admin/deployment-settings` 5개, `DOMAIN_TLS` 잡, `HostApplyGateway` |
| 8 전체 공지 + 관리자 화면 | `0fa3cd5` | `AdminDeploymentSettingsPage`, 적용 직전 전체 공지 |
| 9 운영 문서 + 패키징 검증 | `badc972` | `test-release-bundle.sh`, `domain-tls-administration.md`, `runtime.env.example` 정리 |
| 10 최종 통합 검증 + 결과 기록 | `a9d6592` | `checkpoint-c-final-verification.md`; 발견 결함 2건 수정(V7 핀, V8 `token_hash`) |

## 최종 검증 결과 (2026-09-02, Docker 있음)

- 백엔드 `./mvnw test`: 499개, 실패 0 / 오류 0 / 건너뜀 0 (Testcontainers MySQL 8.4 포함)
- 프런트엔드 `vitest run`: 11개 통과, `npm run build`: 경고 포함 통과(500 kB 초과 청크 1건)
- Bash/배포 계약 9종 + `git diff --check`: 전부 통과
- 상세: `docs/operations/checkpoint-c-final-verification.md`

## 출시 전 남은 검증 (미수행 — 통과로 표시하지 않음)

- Ubuntu 24.04 + Docker + systemd VM 인수 시험 (실 설치→readiness→제거)
- 호스트 적용기 end-to-end (실 `docker compose` 재생성 + HTTPS 헬스체크 + 비동기 결과 대기)
- 사내 LLM 실연동, 측정된 용량, Ubuntu ShellCheck, 프런트엔드 청크 분할 효과
