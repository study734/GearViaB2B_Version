# On-Premise 시연 영상 — 녹화 런북

`ONPREM_VIDEO_PLAN.md` 의 실행 기록판. 촬영하면서 실제 값을 여기에 채운다.

---

## 0. 사전 점검

- [ ] `ffmpeg -version` 에 `enable-libass` 있음
- [ ] `C:/Windows/Fonts/malgun.ttf` 존재 (또는 `segments.json` 의 폰트 수정)
- [ ] `VBoxManage --version` 동작 (`C:\Program Files\Oracle\VirtualBox\`)
- [ ] `cd e2e && npm ci && npm run install:browsers`
- [ ] `npm run assemble -- --dry-run` 통과
- [ ] `cd e2e && npx tsc --noEmit` 통과

## 1. VM 준비

| 항목 | 값 |
|---|---|
| VM 이름 | `__________` |
| 베이스 스냅샷 (Ubuntu+git+GA) | `os-ready` |
| 설치 후 스냅샷 | `post-install-clean` |
| Host-Only IP | `__________` |
| `vm.config.json` 작성 | [ ] |

```
npm run vm:record --provision      # 1회, 베이스 VM 무인 설치
# 게스트에서: VBoxManage snapshot <vm> take os-ready --live
npm run vm:record                  # 설치 실행 + 화면 녹화 → video/input/install-raw.webm
```

- [ ] `video/input/install-raw.webm` 생성됨, 길이 `______`
- [ ] `output/assemble/install-log.txt` 에 설치 로그 (healthy 확인)

## 2. 데모 데이터 (가상)

| env | 값 |
|---|---|
| `E2E_ADMIN_USER` | `__________` |
| `E2E_ADMIN_ACTIVE_USER_NAME` | `__________` |
| `E2E_ADMIN_SUSPENDED_USER_NAME` | `__________` |
| NAS 마운트 `/opt/b2bgearvia/data/nas` | [ ] |
| 로그인 이력·감사 로그 비어있지 않음 | [ ] |
| AI 사용량 레코드 ≥ 1, API 키 마스킹 | [ ] |
| 브랜딩용 조직명/로고 준비 | [ ] |

## 3. Playwright chapter 녹화

공통 env (PowerShell) — `ONPREM_VIDEO_PLAN.md` §5.2 참고. `E2E_ADMIN_MFA_CODE` 는 실행 직전 6자리.

| chapter | 명령 | webm → `video/input/` | 상태 |
|---|---|---|---|
| 04 | `record:chapter -- tests/chapters/04-admin-users.spec.ts` | `onprem-04-users.webm` | [ ] |
| 09 | `... 09-audit.spec.ts` | `onprem-09-audit.webm` | [ ] |
| 08 | `... 08-monitoring.spec.ts` | `onprem-08-monitoring.webm` | [ ] |
| 06 | `... 06-ai-settings.spec.ts` | `onprem-06-ai.webm` | [ ] |
| 10 | `... 10-branding-notice.spec.ts` | `onprem-10-branding.webm` | [ ] |
| 07 | `E2E_ALLOW_NAS_SWITCH=true` + `... 07-storage.spec.ts` | `onprem-07-nas.webm` | [ ] |

- [ ] NAS 전환 전후 backend 컨테이너 ID 동일: `docker inspect --format '{{.Id}}' <backend>` → `before ______ / after ______`

## 4. 조립

```
npm run assemble -- --dry-run     # 총 길이 확인 (목표 2:40~3:10)
npm run assemble                  # → output/assemble/onprem-final.mp4
```

`segments.json` 최종값 (첫 dry-run 후 조정한 값 기록):

| segment | inSec | outSec | 길이 |
|---|---|---|---|
| install parts | | | |
| ch04-login | | | |
| ch04-users | | | |
| ch09-audit | | | |
| ch08-monitoring | | | |
| ch07-nas | | | |
| ch06-ai | | | |
| ch10-branding | | | |

- 총 길이: `______`

## 5. 최종 검수 (`ONPREM_VIDEO_PLAN.md` §8)

- [ ] 첫 90초로 "설치·관리자+MFA·사용자 통제·기록 추적" 완결
- [ ] 모든 장면이 "왜 On-Premise?" 에 YES
- [ ] 비밀번호 / MFA QR·코드 / API 키 / 실제 개인정보 노출 0 프레임
- [ ] 설치 배속 구간 자연스러움
- [ ] H.264 MP4, 무음, 1920×1080, 2:40~3:10
