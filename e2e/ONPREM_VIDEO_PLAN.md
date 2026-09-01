# On-Premise GearVia 시연 영상 — 실행 계획

> 이 문서는 실행 지침이다. 설계는 확정되었으므로 더 흔들지 않는다.
> 기존 `e2e/` harness의 의미(spec assert·안전 계약)를 바꾸지 않는다. 영상 조립 파이프라인(`e2e/video/`)과 문서만 추가한다.
> 편집기를 쓰지 않는다 — 입력 클립 + `segments.json` + `captions.json` 에서 `npm run assemble` 하나로 최종본이 나온다.

---

## 0. 목적 (FROZEN)

> **"GearVia의 협업 기능에 기업 내부 구축과 중앙 관리 기능을 결합한 On-Premise 협업 플랫폼임을 보여준다."**
>
> 영상은 협업 기능 자체가 아니라, **기업이 GearVia를 직접 구축·관리·통제할 수 있다는 차이**를 증명한다.

모든 장면은 다음 질문에 YES여야 한다: **"이 장면이 On-Premise여야 하는 이유를 보여주는가?"**
NO면 일반 GearVia 영상과 중복이므로 뺀다.

증명할 세 가지: **① 자체 운영 ② 조직 통제 ③ 운영 가능성(모니터링·감사·브랜딩·NAS)**

---

## 1. 확정 원칙 9개

1. 목적 정의 FROZEN (위 0장).
2. 기존 chapter `04 · 06 · 07 · 08 · 09 · 10`을 beat 소스로 재사용한다. 관리자 로그인+MFA 는 `04` webm 앞부분의 `loginAsAdmin` 을 쓴다 (`01-auth`·`05` 는 안 씀).
3. 신규 파일은 spec 복제가 아니라 **조립 파이프라인**만. chapter별 webm + 설치 원본을 `video/assemble.mjs`(ffmpeg)로 정규화·배속·concat·자막까지 한 번에 만든다. 편집기 없음.
4. 기존 `E2E_ALLOW_*` default-deny 계약을 유지한다.
5. NAS는 **폐기 가능한 촬영 VM + 명시적 opt-in**(`E2E_ALLOW_NAS_SWITCH=true`)일 때만 실제 전환을 촬영한다.
6. NAS 전환 전후 컨테이너 ID 동일 여부는 **완료 기준(검증)**으로만 확인한다. 영상은 전환 성공 UI 중심, 터미널 노출 최소.
7. 자막은 **데이터(`video/captions.json`) → SRT**. 시간은 clip 시작 기준으로만 적고, 최종 절대 타임라인은 `assemble.mjs`가 세그먼트 길이에서 자동 계산해 굽는다. 재촬영 시 JSON만 고쳐 재실행 — 타임라인 수작업 없음.
8. 설치 장면은 **실제 1회 완주 녹화 → `clip-ramped`로 대기 구간만 배속, 결과 15~20초**. 재현 연출 금지.
9. **첫 90초 안에 이야기가 완결**되고, 나머지는 기술적 깊이. 예외 규칙은 `README.md`·`COVERAGE.md`·커밋 메시지에 기록.

---

## 2. 촬영 범위

### 포함 (각 beat = 왜 On-Premise인가에 직접 답함)
| beat | 소스 | 증명 |
|---|---|---|
| 서버 직접 설치 | VM 화면 녹화 (`vm-record.mjs`) | 자체 운영 |
| 컨테이너·HTTPS 기동 | VM 화면 녹화 | DB/백엔드 내부망 격리 |
| 관리자 로그인 + MFA | **`loginAsAdmin` 헬퍼** — `04/06/07/08/09/10` 각 webm 앞부분에 들어 있음. `ch04` 클립의 시작을 안 잘라서 이 장면으로 씀 (`01-auth`는 일반 사용자 흐름이라 **안 씀**) | 조직 통제 |
| 사용자 계정 중앙 통제 | `04-admin-users` | 조직 통제 |
| 로그인 이력 + 감사 로그 | `09-audit` (리포트 추적 → 로그인 이력 → 감사 로그) | 조직 통제 / 추적 |
| 서버 자원 모니터링 | `08-monitoring` | 운영 가능성 |
| NAS 연결·전환 | `07-storage` + `E2E_ALLOW_NAS_SWITCH=true` | 운영 가능성 (최우선 차별화) |
| AI 정책·사용량 | `06-ai-settings` | 조직 통제 |
| 조직 브랜딩 | `10-branding-notice` (브랜딩만, 공지 제외) | 운영 가능성 (차별화 약 — 오버플로 시 1순위 컷) |

### 제외
- 일반 GearVia 흐름 전체: 업무 생성, 댓글, 채팅, 프로젝트, 캘린더, 일반 AI 비서 사용법 (`02`, `03`)
- 관리자 업무 관리 (`05-admin-tasks`), 공지 발송 (`10`의 notice 부분)
- 서비스 코드·API·DB 스키마 변경

---

## 3. 산출물 및 파일 변경

### 신규 파일 (모두 `e2e/` 하위, 기존 파일 의미 불변)
| 파일 | 내용 |
|---|---|
| `e2e/ONPREM_VIDEO_PLAN.md` | 이 문서 |
| `e2e/onprem-recording-runbook.md` | 실제 사용한 env · 각 클립 in/out · `segments.json` 최종값 기록 |
| `e2e/video/segments.json` | 조립 매니페스트 (세그먼트 순서·소스·trim·배속·카드 문구). id 는 `captions.json` 의 `clips` 와 1:1 |
| `e2e/video/captions.json` | 자막 소스 (문구 + clip 시작 기준 시간). **문구는 여기서만 수정** |
| `e2e/video/build-captions.mjs` | `captions.json` → SRT. 의존성 없음. `npm run build:captions` |
| `e2e/video/assemble.mjs` | `segments.json` → `onprem-final.mp4` (정규화·배속·concat·자막 굽기). `npm run assemble` |
| `e2e/video/vm-record.mjs` | VBoxManage 로 폐기 VM 복제 → installer 실행 → 화면 녹화 → 스냅샷 → `input/install-raw.webm`. `npm run vm:record` |
| `e2e/video/timeline.example.json` | 자막 타임라인 수동 오버라이드 형태 참고 (평소엔 `assemble.mjs`가 자동 생성) |
| `e2e/video/README.md` | 조립 파이프라인 사용법 |
| `e2e/video/input/` | 입력 클립 (`install-raw.webm`, `onprem-XX-*.webm`) — gitignore |
| `e2e/output/assemble/`, `e2e/output/captions/` | 중간 산출물 · SRT · 최종 mp4 — gitignore |

### 기존 파일 최소 수정
| 파일 | 수정 |
|---|---|
| `e2e/README.md` | "Destructive / state-changing demo actions" 절에 `E2E_ALLOW_NAS_SWITCH` 예외 추가 (§7 문구) |
| `e2e/COVERAGE.md` | storage/NAS 항목 옆에 한 줄 예외 표기 (§7 문구) |
| `e2e/tests/chapters/07-storage.spec.ts` | `allowNasSwitch()` 일 때만 `NAS 연결 테스트 및 전환` 클릭 + 성공 상태 확인 분기 **추가**. 기존 assert 유지 |
| `e2e/support/live-test.ts` | `allowNasSwitch()` 헬퍼 추가 (`allowAiCalls()` 와 동일 패턴) |
| `e2e/README.md` · `e2e/COVERAGE.md` | `E2E_ALLOW_NAS_SWITCH` 예외 문서화 (§7) |
| `e2e/package.json` | `build:captions`, `assemble`, `vm:record` 스크립트 추가 |
| `e2e/.gitignore` | `video/input/` 추가 |

### 입력·산출물 (gitignore, 저장소 밖 보관)
- `video/input/install-raw.webm` — VM 설치 완주 원본
- `video/input/onprem-XX-*.webm` — chapter별 Playwright 클립
- `output/assemble/onprem-final.mp4` — `npm run assemble` 최종본 (1920×1080, 30fps, H.264, 무음, 한국어 자막)

---

## 4. 환경 준비

### 4.1 촬영용 VM (폐기 가능)
1. VirtualBox에 Ubuntu Server 24.04 LTS x86_64 VM 생성. 어댑터1 NAT, 어댑터2 Host-Only.
2. 저장소 clone 후 설치기 실행:
   ```bash
   git clone https://github.com/HO-0219/GearViaB2B_Version.git
   cd GearViaB2B_Version
   sudo ./installer/install-virtualbox.sh
   ```
3. **설치 직후 스냅샷 생성** (`post-install-clean`). 촬영 실패 시 여기서 재시작.
4. `admin / admin` 로그인 → 비밀번호 변경 → `/opt/b2bgearvia/config/initial-admin.txt` 삭제 확인.
5. 관리자 MFA 등록 (인증 앱). **이 과정은 녹화하지 않는다.**
6. NAS 공유 스토리지를 `/opt/b2bgearvia/data/nas`에 실제 마운트. storage provider 초기값 = `local`.

### 4.2 데모 데이터 (가상, 포트폴리오용)
- 활성 사용자 1명 / 정지 사용자 1명 (`E2E_ADMIN_ACTIVE_USER_NAME`, `E2E_ADMIN_SUSPENDED_USER_NAME`)
- 로그인 성공·실패 이력이 비어 있지 않도록 사전 로그인 시도 몇 건
- 감사 로그가 비어 있지 않도록 관리자 조작 몇 건 (계정 발급 등)
- AI: 실제 API 키는 **마스킹 표시**만. 촬영용 호출 기록 1건 이상. 키 원문 노출 금지
- 사람 이름·메일·업무명은 전부 가상

### 4.3 비밀값 취급 (한 프레임도 노출 금지)
초기 비밀번호 / MFA QR·secret·6자리 코드 / API 키 원문 / 실제 개인정보.

---

## 5. 녹화

### 5.1 설치 화면 (`npm run vm:record` — VBoxManage 자동)
- `video/vm.config.json` 작성(예시 파일 복사) 후 `npm run vm:record`:
  베이스 스냅샷(`os-ready`) 복원 → 헤드리스 부팅 → `git clone` → **VBox 화면 녹화 시작** → `guestcontrol` 로 `sudo ./installer/install-virtualbox.sh` → 컨테이너 healthy 대기 → `curl -k https://localhost` → 녹화 종료 → `post-install-clean` 스냅샷 → `video/input/install-raw.webm`.
- 1회성 베이스 VM 은 `node video/vm-record.mjs --provision` (Ubuntu ISO 무인 설치).
- OBS 대안: 데스크톱 터미널에서 수동 녹화 후 같은 경로에 두면 된다.
- 설치 stdout 은 `output/assemble/install-log.txt` 로 저장(영상 아님, healthy 근거).
- 배속은 `segments.json` 의 `install` (`type: clip-ramped`) `parts` 로 처리:
  - 명령 입력 / 최종 `docker compose ps` healthy / HTTPS 접속 = `speed: 1`
  - Docker Engine 설치·이미지 빌드·대기 = `speed: 30` 내외
  - raw 길이 확인 후 각 part 의 `inSec`/`outSec` 를 실제 값으로. 결과 길이 목표 **15~20초** (`npm run assemble -- --dry-run` 으로 확인)

### 5.2 관리자 화면 (Playwright, 기존 chapter 재사용)
VM을 향해 실행. 공통 env (PowerShell):
```powershell
$env:E2E_MODE = 'live'
$env:E2E_LIVE_CONFIRMED = 'true'
$env:DEMO_ENABLED = 'false'
$env:E2E_SKIP_WEBSERVER = 'true'
$env:E2E_IGNORE_HTTPS_ERRORS = 'true'      # VM 자체서명 인증서
$env:E2E_BASE_URL = 'https://<VM-IP>'
$env:E2E_ADMIN_USER = '<가상 관리자>'
$env:E2E_ADMIN_PASSWORD = '<변경한 비밀번호>'
$env:E2E_ADMIN_MFA_CODE = '<촬영 시점 6자리>'
$env:E2E_ADMIN_ACTIVE_USER_NAME = '<가상 활성 사용자>'
$env:E2E_ADMIN_SUSPENDED_USER_NAME = '<가상 정지 사용자>'
$env:E2E_PAUSE_MS = '1500'
$env:E2E_ALLOW_NAS_SWITCH = 'false'        # NAS chapter에서만 아래처럼 true
```
클립별 실행 (`01-auth`·`05` 는 안 씀):
```powershell
cd e2e
npm ci
npm run install:browsers
npm run record:chapter -- tests/chapters/04-admin-users.spec.ts   # 앞부분 loginAsAdmin = MFA 장면. head 안 자름
npm run record:chapter -- tests/chapters/09-audit.spec.ts
npm run record:chapter -- tests/chapters/08-monitoring.spec.ts
npm run record:chapter -- tests/chapters/06-ai-settings.spec.ts
npm run record:chapter -- tests/chapters/10-branding-notice.spec.ts
# NAS: 촬영 세션에서만 opt-in (실제 local -> nas_mount 전환)
$env:E2E_ALLOW_NAS_SWITCH = 'true'
npm run record:chapter -- tests/chapters/07-storage.spec.ts
$env:E2E_ALLOW_NAS_SWITCH = 'false'
```
- 각 실행의 `e2e/output/test-results/<test>/video.webm`을 `e2e/video/input/onprem-XX-<name>.webm`으로 복사 (`segments.json` 의 `source` 이름과 일치).
- **관리자 로그인+MFA 장면**은 `01-auth`(일반 사용자 흐름)가 아니라 `04` webm 앞부분의 `loginAsAdmin` 이다. `segments.json` 에서 `ch04-login`(같은 webm, `inSec: 0`)으로 그 구간을 쓰고, `06/07/08/09/10` 은 `inSec` 을 로그인 이후(~9초)로 잡아 반복되는 로그인 장면을 자른다.
- chapter별 별도 브라우저 컨텍스트 = 별도 webm. 이어붙이기는 `assemble.mjs`(ffmpeg concat)가 한다.

### 5.3 실제 상태 변경 (촬영 대상)
- **NAS**: `local → nas_mount` 전환 실행 + 연결 성공 UI + "현재 저장소: NAS/사내 스토리지" 상태까지.
- **브랜딩**: 포트폴리오용 조직명·로고 1건 실제 저장 → 로그인/관리자 화면 반영 확인. (복구 쉬움)
- 그 외(사용자 정지, AI 설정 저장, 공지 발송)는 **버튼·확인 단계까지만**.

---

## 6. 타임라인 / 컷 리스트

`segments.json` 이 실제 소스다. 아래는 첫 녹화 전 계획값 (총 ≈ 2:44). `npm run assemble -- --dry-run` 이 실제 세그먼트 길이를 출력한다.

| 세그먼트 | 대략 구간 | 길이 | 티어 | 자막(요지) |
|---|---|---|---|---|
| `title` (카드) | 0:00–0:08 | 8s | — | On-Premise GearVia |
| `install` (배속) | 0:08–0:39 | ~31s | core | SaaS 가입 없이 직접 설치 / DB·백엔드 내부망 격리 |
| `ch04-login` | 0:39–0:52 | ~13s | core | 관리자 MFA로 운영 권한 보호 |
| `ch04-users` | 0:52–1:12 | ~20s | core | 계정 직접 발급 / 활성·정지 중앙 통제 |
| `ch09-audit` | 1:12–1:34 | ~22s | core | 리포트 추적 → 로그인 이력 → 감사 로그 |
| `ch08-monitoring` | 1:34–1:48 | ~14s | 축소 | CPU·메모리·저장소 상태 확인 |
| `ch07-nas` | 1:48–2:12 | ~24s | 유지 | 재시작 없이 사내 NAS로 전환 |
| `ch06-ai` | 2:12–2:26 | ~14s | 축소 | AI 사용 여부·사용량 조직 정책으로 통제 |
| `ch10-branding` | 2:26–2:34 | ~8s | 부차 | 조직명·로고 자체 구성 (오버플로 시 1순위 컷) |
| `ending` (카드) | 2:34–2:44 | 10s | — | 기업이 직접 구축·관리·통제하는 On-Premise GearVia |

- **첫 90초 완결선**: `title`~`ch09-audit` 초반(≈ 1:20~1:34)까지 보면 "직접 설치 · 관리자+MFA · 사용자 통제 · 기록 추적" 이야기가 끝난다. `install` 을 27s 로 줄이면 정확히 90초.
- **티어링** (덜 중요한 건 스치듯): core 는 넉넉히, `monitoring`/`ai` 는 ~14s 로 축소, `branding` 과 부차 테이블(리포트 추적 등)은 3~8s. 세부 조정은 `segments.json` 의 `inSec`/`outSec` + `support/live-test.ts` 의 `pause()` 값.

### 자막 규칙
- 한 화면 최대 2줄, 최소 2.5초 유지. 무음이므로 읽을 시간 확보.
- 기술 로그 전문을 읽히지 않는다. "성공 상태 → 기업 운영 의미" 연결.
- 위 표의 자막 문구는 **`e2e/video/captions.json` 이 원본**이다. 표는 참고용.

### 조립 파이프라인 (`npm run assemble`)
1. `video/input/` 에 `install-raw.webm` + `onprem-XX-*.webm` 배치.
2. `video/segments.json` 의 세그먼트별 `inSec`/`outSec`, 설치 `parts` 배속을 첫 녹화 보고 조정.
3. `npm run assemble -- --dry-run` — 세그먼트 길이·총 길이·자막 타임라인만 확인 (ffmpeg 미실행).
4. `npm run assemble` — 각 세그먼트 정규화(1920×1080/30fps/무음) → concat → `captions.json`+자동 타임라인으로 `final.srt` 생성 → 자막 굽기 → `output/assemble/onprem-final.mp4`.
- 자막 절대 시간은 `assemble.mjs` 가 세그먼트 길이에서 계산한다. `captions.json` 은 **clip 시작 기준 시간**만 유지.
- 카드(타이틀/엔딩)는 `segments.json` 의 `text` 로 ffmpeg `drawtext` 생성 — 별도 이미지 없음.
- 검증: 중복 id·source 없음·길이 0 이하는 중단, 총 길이 2:40~3:10 밖이면 경고. `captions.json` 쪽은 `build-captions.mjs` 가 검증.
- **재촬영 시**: 해당 `onprem-XX-*.webm` 교체 → 길이 달라졌으면 `segments.json` 그 세그먼트 `inSec`/`outSec` 만 조정 → `npm run assemble`. 편집기·타임라인 드래그 없음.
- 필요 조건: `ffmpeg` libass 포함 빌드(`ffmpeg -version | grep libass`), 한글 폰트(기본 `C:/Windows/Fonts/malgun.ttf`).

---

## 7. Deviation 문서화 (반드시)

### `e2e/README.md` — "아직 자동화하기 어려운 기능" 근처 또는 별도 절
```md
### Destructive / state-changing demo actions

NAS provider switching is disabled by default.

- Default: `E2E_ALLOW_NAS_SWITCH=false` (preview/confirm screen only)
- Showcase exception: `E2E_ALLOW_NAS_SWITCH=true` may be used ONLY on a
  disposable demo VM prepared specifically for recording.
- Never enable this against a shared or production-like environment.
```

### `e2e/COVERAGE.md` — storage/NAS 항목 옆
```text
Default: preview/test only
Recording exception: disposable VM + E2E_ALLOW_NAS_SWITCH=true
```

### 커밋 메시지
```
test(e2e): add opt-in NAS switch path for on-prem showcase recording

Default stays preview-only (E2E_ALLOW_NAS_SWITCH=false). The real
local->nas_mount switch runs only on a disposable recording VM with
E2E_ALLOW_NAS_SWITCH=true. Existing chapter assertions unchanged.
```

---

## 8. 검증 / 완료 기준

### 정적
- [ ] `cd e2e && npx tsc --noEmit` 통과
- [ ] `npx playwright test --list`에 수정한 chapter가 정상 표시
- [ ] 기존 chapter의 assert 삭제/약화 없음 (diff 검토)
- [ ] `npm run build:captions` 무경고 통과 (clip별 SRT 14 cue 생성)
- [ ] `npm run assemble -- --dry-run` 통과 (총 길이 3:00±, `captions.json` clips 와 `segments.json` id 일치)
- [ ] `ffmpeg -version | grep libass` 확인, 한글 폰트 경로 존재

### 라이브 리허설 (촬영 VM)
- [ ] 설치 종료 후 전 컨테이너 healthy, health endpoint 정상
- [ ] 내부 HTTPS 로그인 화면 정상
- [ ] 관리자 MFA 로그인 성공
- [ ] `04` 사용자 표에 활성·정지 사용자 실제 표시
- [ ] `08` 모니터링에 CPU·메모리·저장소 실제 수치
- [ ] `07` NAS: `local → nas_mount` 실제 변경 + 연결 성공 표시
- [ ] **NAS 전환 전후 backend 컨테이너 ID 동일** (`docker inspect --format '{{.Id}}'`) — 무재시작 런타임 전환 증명. *영상에는 안 넣음, 근거로만 보관*
- [ ] `06` AI 사용량 / `09` 감사 로그 / 로그인 이력이 빈 화면 아님
- [ ] `10` 브랜딩 저장 후 로그인·관리자 화면 반영

### 최종 영상
- [ ] 총 길이 2:40 ~ 3:10
- [ ] 첫 90초만으로 "자체 설치 · 관리자 통제 · 감사 추적" 이야기 완결
- [ ] 모든 장면이 "왜 On-Premise인가?"에 YES
- [ ] `onprem-final.mp4` 가 `npm run assemble` 산출물이고 편집기 수작업분이 없음
- [ ] 자막이 `captions.json` → 자동 타임라인 → `final.srt` 로 구워짐. 모든 자막 2줄 이하 · 2.5초 이상
- [ ] 비밀번호 / MFA QR·코드 / API 키 / 실제 개인정보 한 프레임도 없음
- [ ] 설치 배속 구간이 자연스럽고 명령/healthy/HTTPS는 정상 속도
- [ ] H.264 MP4, 무음, 1920×1080

---

## 9. 리스크 / 폴백

| 리스크 | 폴백 |
|---|---|
| 설치가 15~40분 → 배속해도 길다 | `install` `parts` 의 대기 구간 `speed` 를 60까지. 정상 속도는 명령 입력·healthy·HTTPS part만 |
| 길이 3:10 초과 | `segments.json` 에서 `ch10-branding` 세그먼트 제거(+`captions.json` 해당 캡션) → 그다음 `ch06-ai` `outSec` 축소. **NAS는 유지** |
| chapter가 VM DOM과 안 맞음 | 해당 chapter만 selector 보정(의미 불변 범위). 안 되면 그 세그먼트를 `type: card` 스틸+자막으로 대체 |
| `concat -c copy` 가 깨짐(파라미터 불일치) | `npm run assemble -- --reencode-concat` (필터 concat 재인코딩) |
| `subtitles` 필터 실패 | ffmpeg 가 libass 미포함 → libass 포함 빌드로 교체. 폰트명은 `subtitle.forceStyle` 의 `Fontname` 확인 |
| MFA 코드 만료로 `01` 실패 | 재실행. MFA 등록 화면은 절대 녹화 금지 |
| 실패한 설치/전환 클립 혼입 | `post-install-clean` 스냅샷에서 재시작. 실패분은 `input/` 에 넣지 않음 |

---

## 10. 작업 순서 요약

**저장소 (완료됨 — 커밋만):** `07-storage.spec.ts` opt-in 분기, `live-test.ts` `allowNasSwitch()`, `README.md`·`COVERAGE.md` deviation, `package.json` 스크립트 3개, `.gitignore`, `video/*` (captions·segments·assemble·build-captions·vm-record·example·README), `onprem-recording-runbook.md`. → `npx tsc --noEmit` + `npm run assemble -- --dry-run` 확인 후 커밋.

**촬영:**
1. `video/vm.config.json` 작성 → `node video/vm-record.mjs --provision` (1회, 베이스 VM) → `os-ready` 스냅샷.
2. `npm run vm:record` → `video/input/install-raw.webm` + `post-install-clean` 스냅샷.
3. 데모 데이터 준비 (§4.2), NAS 마운트.
4. 관리자 chapter 6개 녹화 (§5.2) → `video/input/onprem-XX-*.webm`. `07` 은 `E2E_ALLOW_NAS_SWITCH=true`.
5. 라이브 리허설 체크리스트 (§8) 통과.
6. `segments.json` 의 `inSec`/`outSec`·설치 `parts` 조정 → `npm run assemble -- --dry-run` 길이 확인.
7. `npm run assemble` → `output/assemble/onprem-final.mp4`.
8. 최종 체크리스트 (§8). 안 맞으면 `segments.json`/`captions.json` 만 고쳐 6~7 반복.
9. `onprem-recording-runbook.md` 에 실제 env·`segments.json` 최종값 기록.
