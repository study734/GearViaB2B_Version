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

## 그 밖의 출시 전 남은 검증 (미수행 — 통과로 표시하지 않음)

- 호스트 적용기 end-to-end (실 `docker compose` 재생성 + HTTPS 헬스체크 + 비동기 결과 대기).
  이번 VM 시험은 설치→헬스→제거만 다룸. 관리자 도메인·SSL 교체 흐름은 미검증.
- 사내 LLM 실연동, 측정된 용량, Ubuntu ShellCheck, 프런트엔드 청크 분할 효과
