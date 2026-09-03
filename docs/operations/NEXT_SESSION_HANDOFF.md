# GearVia 자동 설치 및 도메인·SSL — 인계

## 저장소와 브랜치

- 원격: `https://github.com/HO-0219/GearViaB2B_Version.git`
- 작업 위치: worktree `sixgill`, 브랜치 `study734/fetch-upstream-onprem-checkpoint`
  (`upstream/feat/gearvia-onprem-checkpoint-a` = `1a21d62` 위에 아래 커밋을 쌓음, 미푸시)
- 기준 커밋(HEAD): `980876d fix: resolve async domain/TLS apply result in the UI`
  (`980876d` 만 미푸시, 나머지는 `origin/study734/fetch-upstream-onprem-checkpoint` 에 있음)
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
| (버그수정) 비동기 apply 가시성 | `980876d` | 프런트가 apply 후 `deploymentJob()` 폴링해 `COMPLETED`/`ROLLED_BACK` 까지 추적; 백엔드 `apply()` 가 `app.host-apply.result-wait-ms`(기본 6초)만큼 결과 대기 |

## 최종 검증 결과 (2026-09-02~03, Docker 있음)

- 백엔드 `./mvnw test`: 499개 통과 (Testcontainers MySQL 8.4 포함) + `980876d` 로 deployment 백엔드 테스트 재확인
- 프런트엔드 `vitest run`: 13개 통과(`980876d` 로 +2), `npm run build`: 경고 포함 통과(555 kB 청크 1건)
- Bash/배포 계약 8종 + `git diff --check`: 전부 통과
- 상세: `docs/operations/checkpoint-c-final-verification.md`

## `980876d` 로 고친 확정 버그 — 비동기 apply 결과를 UI가 못 봄

host-apply 는 systemd `.path` 로 **비동기** 실행(실측 ~2초 지연). 기존:
`DeploymentSettingsService.apply()` 가 `submit()` 직후 `readResult()` → 항상 empty →
job `SWITCHED(80%)` 반환. `SWITCHED→COMPLETED` 전이는 `GET /jobs/{id}` 때만 일어나는데
프런트가 그걸 안 부름(폴링/새로고침 없음). `deployment_settings.public_url` 도 비동기
경로에선 영영 갱신 안 됨. `@Scheduled` 재확인도 없음.

수정(TDD):
- `AdminDeploymentSettingsPage`: `pollIntervalMs`(기본 2000) prop, apply 후
  `deploymentJob(jobId)` 를 종료 상태까지 폴링, 진행률·상태 갱신, 언마운트 시 취소.
  vitest 2개 추가(SWITCHED 폴링 완료 / ROLLED_BACK 사유 표시).
- `DeploymentSettingsService.apply()`: 결과파일을 `app.host-apply.result-wait-ms`
  (기본 6000, 300ms 간격) 까지 대기 → 빠른 케이스는 apply 응답 1번에 `COMPLETED`.
  `AdminDeploymentSettingsApiTest.applyWaitsForAnAsyncHostResultBeforeReturning` 추가.

> ⚠ `980876d` 는 **실 HW 미검증**. 단위 테스트만. 브라우저 apply→폴링→COMPLETED +
> 실제 비동기 host-apply e2e 는 아래 `dev-onprem-980876d` 스냅샷으로 확인할 것.

## VM 개발 가속 스냅샷 `dev-onprem-980876d` (2026-09-03 생성)

`os-ready` 의 sibling(= `app-fresh` 형제, 데모 사다리 `os-ready→app-fresh→seeded` 안 건드림).
내용: `980876d` 설치 완료 + 이미지 빌드됨 + 4컨테이너 healthy 직후 `poweroff`.
`b2bgearvia.service` enabled 라 부팅 시 자동 기동(첫 부팅 ~2분). **이미지 재빌드(~8분) 생략.**

```bash
VBoxManage snapshot GearVia-rec restore dev-onprem-980876d
VBoxManage startvm GearVia-rec --type headless
VBoxManage controlvm GearVia-rec natpf1 "acctest,tcp,127.0.0.1,2222,,22"
ssh -i onprem-demo-video/e2e/output/assemble/vm_key -p 2222 gearvia@127.0.0.1
# 테스트 후: VBoxManage controlvm GearVia-rec poweroff && VBoxManage snapshot GearVia-rec restore seeded
```

- `980876d` 에 묶임. 브랜치에 커밋 더 쌓이면 재생성 필요.
- **브랜치 머지되면 삭제**: `VBoxManage snapshot GearVia-rec delete dev-onprem-980876d`
- 안식 상태는 항상 `poweroff @ seeded` 로 되돌릴 것 (데모 파이프라인 기대값).

## 실 Ubuntu 24.04 VM 인수 시험 — 완료 (2026-09-03)

환경: VirtualBox `GearVia-rec`, `os-ready` 스냅샷(클린 Ubuntu 24.04.4 LTS, kernel 6.8,
git+sshd+NOPASSWD sudo), 2 CPU / 3.9 GB RAM. VBoxManage
`C:/Program Files/Oracle/VirtualBox/VBoxManage.exe`. SSH 키
`onprem-demo-video/e2e/output/assemble/vm_key`, guest `gearvia` / sudo pw `Gearvia-rec-2026`.
브랜치 코드(`bc89999`)는 `git bundle create <b> HEAD` → scp → `git clone <b>` (detached HEAD)
로 전송(푸시 없이). 접속: NAT 포트포워드
`VBoxManage controlvm GearVia-rec natpf1 "acctest,tcp,127.0.0.1,2222,,22"` 후
`ssh -i <key> -p 2222 gearvia@127.0.0.1`. 시험 후 포트포워드 삭제 + `poweroff` +
`snapshot restore seeded` 로 원복함(현재 `poweroff @ seeded`).

### 전 단계 통과

- Docker Engine 29.7.2 + Compose v5.5.0 설치 (`get.docker.com`, NAT egress)
- `sudo ./install_gearvia_ai_agent_ubuntu.sh --db-password-file /tmp/dbpw` (비번 20자)
- OS/아키텍처 검증 → 소스 빌드 `b2bgearvia-backend:bc899997f643`(Maven) +
  `b2bgearvia-web:bc899997f643`(npm) 성공 (~6분) → `mysql:8.4`·`busybox:1.37` pull
- `runtime.env` + 로컬 CA/서버 TLS 생성. 서버 인증서 SAN =
  `IP:10.0.2.15, DNS:gearvia-rec, DNS:localhost, IP:127.0.0.1`
- systemd `b2bgearvia.service` `active`+`enabled`; compose 4개 컨테이너
  (`mysql`/`backend`/`web` healthy, `init-data` exited 0)
- `sudo curl --cacert /etc/gearvia/tls/ca.crt https://127.0.0.1/api/v1/health/ready`
  → `{"status":"UP"}` HTTP 200 (로컬 CA 체인 검증 성공). `https://localhost/...` 도 동일
- `gearvia-host-apply.path` `active`, `/etc/gearvia/host-apply.key` (0600 root) 존재
- `sudo ./uninstall_gearvia_ai_agent_ubuntu.sh` → 컨테이너·네트워크 제거,
  `[GearVia] ... database volumes ... were preserved`
- 제거 후: `/etc/gearvia` 전체 삭제(활성 TLS·host-apply.key 포함), gearvia systemd 유닛
  전무, 데이터 볼륨 `b2bgearvia-mysql-data`·`b2bgearvia-uploads` 보존, 컨테이너 0

### 관찰 (전부 사소, 차단 아님)

1. 443 만 게시됨(80 미청취) — HTTP→HTTPS 리다이렉트 없음. 설계상 443 단독이면 정상,
   80 리다이렉트를 기대했다면 `infra/b2b/compose.yml` web 포트 확인.
2. 제거 후 `systemctl is-active b2bgearvia` 가 `inactive` 아닌 `failed` 반환(유닛 파일이
   사라진 뒤 systemd 잔여 상태). `ls /etc/systemd/system` 로는 유닛 없음 확인됨. 표시상 문제.
3. (이전 세션 관찰 유지) 설치기 `gearvia_password_is_valid` 가 DB 비번 16자 최소를 입력
   단계에서 안 잡음 — 짧으면 이미지 빌드+compose 기동 후 백엔드 fail-fast 로만 걸림.
4. (이전 세션 관찰 유지) `b2bgearvia.service` `TimeoutStartSec=0` + web `depends_on:
   backend healthy` — 백엔드가 healthy 못 되면 `systemctl enable --now` 가 무한 블록 가능.
5. SSH 로 설치기/제거기 실행 시 세션이 프로세스 stdout 을 붙들어 클라이언트가 매달림.
   `nohup ... >log 2>&1 &` + 별도 폴링(`pgrep -f install_gearvia`)으로 우회.

## 잔여 위험 (2026-09-03 기준) — 출시 차단 버그 없음, 전반 LOW~MEDIUM

| # | 위험 | 등급 | 비고 |
|---|---|---|---|
| 1 | `980876d` 실 HW 미검증 | MED | 브라우저 apply→폴링→COMPLETED + 비동기 host-apply e2e 미실행. 단위 테스트만. `dev-onprem-980876d` 스냅샷으로 확인 |
| 2 | MCP 동적 오리진 미반영 | LOW | `McpNetworkPolicy` 가 정적 `MCP_ALLOWED_ORIGINS` 만 봄. MCP 기본 OFF. 도메인 변경 시 MCP 클라 403 → `runtime.env` 수동 갱신+재기동 필요. **문서화 안 됨.** `PublicUrlProvider.isAllowedOrigin()` 경유하도록 고치거나 `domain-tls-administration.md` 에 명시할 것 |
| 3 | 자체 서명 모드 미구현 | LOW | 계획 Task 8 범위였으나 업로드 전용 구현. 적용기 `gearvia-host-apply.sh:92` 는 `self-signed` 이미 지원. 백엔드 `CANDIDATE_MODE="uploaded"` 하드코딩 + 프런트 모드 토글 없음. 회귀 아님 |
| 4 | fresh 설치 users 0행, 첫 관리자 웹 온보딩 | INFO | 설계상. 온보딩 후 새 `/admin/deployment-settings` 탭 도달성 브라우저 미확인 |
| 5 | `apply()` 가 `@Transactional` 안에서 최대 6초 sleep | LOW | job 행 락 유지. 관리자 전용·희귀·싱글턴. 추후 txn 밖으로 이동 가능 |
| 6 | `b2bgearvia.service` `TimeoutStartSec=0` | LOW | 백엔드 unhealthy 시 `systemctl enable --now` 무한 블록. 정상 구성이면 미발생 |
| 7 | 적용기 SAN `IPAddress:` (공백 없음) 프런트 raw 노출 | COSMETIC | `certificateSans` 콤마 split 후 `IPAddress:10.0.2.15` 토큰 그대로 표시 |
| 8 | 프런트 555 kB 단일 청크 | COSMETIC | 빌드 경고만, 선재. WAN 배포 전 코드 스플릿 측정 권장 |

## 그 밖의 출시 전 남은 검증 (미수행 — 통과로 표시하지 않음)

- 관리자 도메인·SSL 교체 흐름 e2e (브라우저: 온보딩→인증서 업로드→연결 테스트→적용→
  진행 폴링→`COMPLETED`, 새 URL 반영, 실패 시 `ROLLED_BACK`). `dev-onprem-980876d` 로 수행.
- 호스트 적용기 실패/롤백 경로 (health check 실패 → 활성 인증서 복원 + web 재재생성).
- 사내 LLM 실연동, 측정된 용량, Ubuntu ShellCheck, 프런트엔드 청크 분할 효과
