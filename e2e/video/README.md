# On-Premise 시연 영상 조립 (ffmpeg 파이프라인)

편집기를 쓰지 않는다. 입력 클립 + `segments.json` + `captions.json` 에서
`ffmpeg` 로 최종 mp4 까지 한 번에 만든다. 재촬영 시 해당 클립만 교체하고 재실행한다.

## 필요 조건

- `ffmpeg` (libass 포함 빌드): `ffmpeg -version | grep libass`
- Node 18+
- 한글 폰트: 기본 `C:/Windows/Fonts/malgun.ttf` (`segments.json` 의 `card.fontFile` / `subtitle.forceStyle` 에서 변경)

## 파일

| 파일 | 역할 |
|---|---|
| `segments.json` | 조립 매니페스트. 세그먼트 순서·소스·trim·배속·카드 문구. **id 는 `captions.json` 의 `clips` 와 1:1** |
| `captions.json` | 자막 소스 (문구 + clip 시작 기준 시간) |
| `build-captions.mjs` | `captions.json` → SRT |
| `assemble.mjs` | `segments.json` → `onprem-final.mp4` (타임라인·자막·정규화·concat·굽기 전부) |
| `timeline.example.json` | 수동 오버라이드용 타임라인 형태 참고 (평소엔 `assemble.mjs` 가 자동 생성) |
| `input/` | 입력 클립 두는 곳 (gitignore). `install-raw.webm`, `onprem-XX-*.webm` |
| `../output/assemble/` | 중간 산출물 + `onprem-final.mp4` (gitignore) |
| `../output/captions/` | 생성된 SRT (gitignore) |

## 입력 준비 (`e2e/video/input/`)

| 파일 | 출처 |
|---|---|
| `install-raw.webm` | `npm run vm:record` (VBoxManage 자동 녹화), 또는 OBS 수동 |
| `onprem-04-users.webm` | `04-admin-users.spec.ts` — 앞부분 loginAsAdmin 이 MFA 장면(`ch04-login`)도 겸함 |
| `onprem-09-audit.webm` | `09-audit.spec.ts` |
| `onprem-08-monitoring.webm` | `08-monitoring.spec.ts` |
| `onprem-06-ai.webm` | `06-ai-settings.spec.ts` |
| `onprem-07-nas.webm` | `07-storage.spec.ts` (`E2E_ALLOW_NAS_SWITCH=true`) |
| `onprem-10-branding.webm` | `10-branding-notice.spec.ts` |

`01-auth`(일반 사용자)와 `05-admin-tasks` 는 쓰지 않는다.

`output/test-results/<test>/video.webm` 를 위 이름으로 복사한다.

## 설치 영상 자동 녹화 (`npm run vm:record`)

VBoxManage 로 폐기 VM 을 다뤄 `install-raw.webm` 을 만든다. OBS 불필요.

```bash
cp video/vm.config.example.json video/vm.config.json   # 경로·게스트 계정 작성 (gitignore)

# 1회: Ubuntu ISO 로 베이스 VM 무인 설치 (15~30분). 끝나면 게스트에서
#   VBoxManage snapshot <vm> take os-ready --live
node video/vm-record.mjs --provision

# 매 촬영: os-ready 복원 → git clone → 화면 녹화 시작 → install-virtualbox.sh
#          → healthy 대기 → 녹화 종료 → post-install-clean 스냅샷 → input/install-raw.webm
npm run vm:record

node video/vm-record.mjs --dry-run        # VBoxManage 명령만 출력
node video/vm-record.mjs --keep-running   # 끝나도 VM 유지 (이어서 Playwright chapter 녹화)
```

`vm.config.json` 필수 키: `vmName`(이름에 rec/demo/test 포함, 아니면 `--force`), `guestUser`, `guestPassword`, `baseSnapshot`. Guest Additions 가 있어야 `guestcontrol` 이 동작한다 (`--provision` 의 `--install-additions`). 설치 stdout 은 `output/assemble/install-log.txt` 에 저장된다(영상 아님, 근거용).

Ubuntu **Server** 콘솔은 텍스트 프레임버퍼라 녹화가 다소 흐릴 수 있다. `assemble.mjs` 가 letterbox 로 맞추며, 더 선명하게 원하면 데스크톱 터미널에서 수동 녹화 후 `input/install-raw.webm` 로 두면 된다.

## 실행

```bash
cd e2e

# 1. 세그먼트 길이·타임라인·자막만 확인 (ffmpeg 미실행)
npm run assemble -- --dry-run

# 2. 전체 조립: 정규화 → concat → 자막 굽기 → output/assemble/onprem-final.mp4
npm run assemble

# 옵션
npm run assemble -- --no-subs           # 자막 없이 컷본만
npm run assemble -- --reencode-concat   # concat -c copy 가 깨질 때 필터 concat 으로 재인코딩
```

## segments.json 튜닝

- `type: "clip"` — `inSec`/`outSec` 로 각 chapter webm 에서 쓸 구간만 잘라낸다. 첫 녹화 후 실제 화면 보고 조정.
- `type: "clip-ramped"` (설치) — `parts` 배열. `speed: 1` 은 정상 속도(명령 입력·완료·HTTPS), 큰 값은 대기 구간 배속. raw 길이 확인 후 `inSec`/`outSec` 를 실제 값으로.
- `type: "card"` — `durationSec` + `text` (`\n` 줄바꿈).
- 세그먼트 길이가 바뀌면 `assemble.mjs` 가 자막 타임라인을 다시 계산하므로 `captions.json` 시간은 **clip 시작 기준**만 유지하면 된다.

## 재촬영 절차

1. 해당 chapter 재녹화 → `input/onprem-XX-*.webm` 교체
2. 필요하면 `segments.json` 의 그 세그먼트 `inSec`/`outSec` 조정
3. `npm run assemble`
4. 끝. 편집기 없음.

## 검증 규칙 (assemble.mjs)

- 오류(중단): 중복 id, source 파일 없음, 계산된 길이 ≤ 0
- 경고(계속): 총 길이가 2:40~3:10 밖
- `captions.json` 쪽 검증(알 수 없는 clip, 시간 역전, 겹침 등)은 `build-captions.mjs` 가 담당
