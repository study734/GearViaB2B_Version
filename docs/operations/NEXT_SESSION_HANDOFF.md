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

## 실 Ubuntu 24.04 VM 인수 시험 — 부분 실행 (2026-09-02)

환경: VirtualBox `GearVia-rec`, `os-ready` 스냅샷(클린 Ubuntu 24.04.4, git+sshd+NOPASSWD
sudo, NAT nic1 + hostonly nic2), 2 CPU / 3.9 GB RAM. VBoxManage
`C:/Program Files/Oracle/VirtualBox/VBoxManage.exe`. SSH 키
`onprem-demo-video/e2e/output/assemble/vm_key`, guest `gearvia` / sudo pw `Gearvia-rec-2026`.
브랜치 코드는 `git bundle create <b> HEAD` → scp → `git clone <b>` 로 전송(푸시 없이).
hostonly 정적 IP(.102)는 `os-ready`에서 안 붙음 → NAT 포트포워드
`VBoxManage controlvm GearVia-rec natpf1 "acctest,tcp,127.0.0.1,2222,,22"` 후
`ssh -p 2222 gearvia@127.0.0.1` 로 접속. 첫 부팅은 SSH-ready 까지 ~5분.

### 통과한 단계

- Docker Engine 29.7.2 + Compose v5.5.0 설치 (`get.docker.com`, NAT 경유)
- `sudo ./install_gearvia_ai_agent_ubuntu.sh --db-password-file /root/pw` 실행
- OS/아키텍처 검증 통과
- **소스 빌드**: `b2bgearvia-backend:<sha12>`(Maven), `b2bgearvia-web:<sha12>`(npm) 둘 다 성공 (~8분)
- `mysql:8.4` / `busybox:1.37` pull, `runtime.env` + 로컬 CA/서버 TLS 생성, `docker compose config` 통과
- systemd `b2bgearvia.service` 설치 + compose up → `mysql` healthy, `init-data` exited 0

### 여기서 잡힌 것

1. **테스트 실수** — 비번 14자였음. 백엔드 `B2bConfigurationValidator` 는
   `SPRING_DATASOURCE_PASSWORD` 16자 이상 요구 → 백엔드 crash → unhealthy → 서비스 실패 →
   설치기 중단. fail-fast 동작 자체는 정상. **재시도 시 16자 이상 비번 사용.**
2. **제품 관찰(사소)** — 설치기 `gearvia_password_is_valid` 가 16자 최소를 안 잡아
   이미지 빌드 + compose 기동을 다 한 뒤에야 백엔드에서 걸림. 입력 단계 즉시 거부 필요.
   (`gearvia-common.sh` 수정 후보)
3. **제품 관찰(사소)** — `b2bgearvia.service` 는 `TimeoutStartSec=0` + web `depends_on:
   backend healthy`. 백엔드가 healthy 안 되면 `up -d` 가 오래 블록되고 `systemctl start`
   타임아웃이 없어 설치기가 `systemctl enable --now` 에서 매달릴 수 있음.

### 미완 (다음 세션)

`os-ready` restore → SSH(NAT 2222) → docker 설치 → bundle clone → **16자+** 비번 파일 →
설치(이미지 재빌드 ~8분) → `curl --cacert /etc/gearvia/tls/ca.crt
https://127.0.0.1/api/v1/health/ready` 성공 확인 → `sudo ./uninstall_gearvia_ai_agent_ubuntu.sh`
→ `test ! -e /etc/gearvia/tls/fullchain.pem` + `docker volume ls` (mysql-data/uploads 보존)
확인 → `poweroff` → `VBoxManage snapshot restore GearVia-rec seeded`.

> VM 은 인수 시험 후 항상 `poweroff @ seeded` 로 원복할 것 (데모 영상 파이프라인이 그 상태를 기대).

## 그 밖의 출시 전 남은 검증 (미수행 — 통과로 표시하지 않음)

- 호스트 적용기 end-to-end (실 `docker compose` 재생성 + HTTPS 헬스체크 + 비동기 결과 대기)
- 사내 LLM 실연동, 측정된 용량, Ubuntu ShellCheck, 프런트엔드 청크 분할 효과
