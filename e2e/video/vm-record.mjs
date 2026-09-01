#!/usr/bin/env node
// 폐기 가능한 VirtualBox VM 에서 On-Premise 설치를 실행하고 화면을 녹화한다.
// 결과: e2e/video/input/install-raw.webm  (assemble.mjs 의 install 세그먼트 소스)
//
//   node video/vm-record.mjs --dry-run          명령만 출력 (VBoxManage 미실행)
//   node video/vm-record.mjs                     기본: 베이스 스냅샷 복원 → 설치 → 녹화 → 스냅샷
//   node video/vm-record.mjs --provision         Ubuntu ISO 로 베이스 VM 무인 설치 (느림, 1회성)
//   node video/vm-record.mjs --keep-running      끝나도 VM 을 끄지 않음 (Playwright chapter 녹화에 재사용)
//
// 설정: video/vm.config.json  (video/vm.config.example.json 복사해서 작성, gitignore)
//
// 전제:
//   - VirtualBox 7.x 설치 (VBoxManage). 경로 자동탐지 또는 config.vboxManage.
//   - 기본 모드: config.vmName VM 에 config.baseSnapshot 스냅샷이 있고
//     그 상태 = Ubuntu + git + Guest Additions, b2bgearvia 미설치.
//   - Guest Additions 가 실행 중이어야 guestcontrol 이 동작한다 (--provision 의 --install-additions).
//
// 한계: Ubuntu Server 콘솔은 텍스트 프레임버퍼라 녹화 해상도가 낮을 수 있다.
//       assemble.mjs 가 letterbox 로 1920x1080 에 맞춘다. 더 선명하게 원하면
//       데스크톱 터미널에서 수동 녹화 후 input/install-raw.webm 로 두면 된다.

import { execFileSync, execFile } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(here, '..');
const inputDir = join(e2eDir, 'video', 'input');
const workDir = join(e2eDir, 'output', 'assemble');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const provision = args.includes('--provision');
const keepRunning = args.includes('--keep-running');
const force = args.includes('--force');

// ---- config ----
const cfgPath = join(here, 'vm.config.json');
if (!existsSync(cfgPath)) {
  console.error(`설정 없음: ${cfgPath}`);
  console.error('video/vm.config.example.json 을 복사해서 작성하세요.');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));

function findVBoxManage() {
  if (cfg.vboxManage && existsSync(cfg.vboxManage)) return cfg.vboxManage;
  const candidates = [
    'C:/Program Files/Oracle/VirtualBox/VBoxManage.exe',
    'C:/Program Files/Oracle/VirtualBox/VBoxManage',
    '/usr/bin/VBoxManage',
    '/usr/local/bin/VBoxManage',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  try { return execFileSync('which', ['VBoxManage']).toString().trim(); } catch { /* noop */ }
  throw new Error('VBoxManage 를 찾지 못했습니다. vm.config.json 의 vboxManage 에 경로를 지정하세요.');
}
const VBM = findVBoxManage();

const vm = cfg.vmName;
const baseSnap = cfg.baseSnapshot ?? 'os-ready';
const postSnap = cfg.postSnapshot ?? 'post-install-clean';
const gUser = cfg.guestUser;
const gPass = cfg.guestPassword;
const repoUrl = cfg.repoUrl ?? 'https://github.com/HO-0219/GearViaB2B_Version.git';
const repoDir = cfg.repoDir ?? `/home/${gUser}/GearViaB2B_Version`;
const rec = { videores: '1920x1080', videofps: 30, videorate: 2048, ...(cfg.recording ?? {}) };
const readyTimeoutSec = cfg.readyTimeoutSec ?? 2400;
const recFileAbs = join(workDir, 'install-raw.webm');
const finalAbs = join(inputDir, 'install-raw.webm');

function vbox(argv, { capture = false } = {}) {
  const printable = `VBoxManage ${argv.join(' ')}`;
  if (dryRun) { console.log(`  $ ${printable}`); return ''; }
  try {
    const out = execFileSync(VBM, argv, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    return out ?? '';
  } catch (e) {
    if (capture) return (e.stdout ?? '') + (e.stderr ?? '');
    throw e;
  }
}

function guestRun(script, { label = '', wait = true } = {}) {
  const sudo = cfg.guestSudoNeedsPassword
    ? `echo ${shq(gPass)} | sudo -S -p '' `
    : 'sudo ';
  const full = script.replace(/\bSUDO\b/g, sudo);
  const argv = [
    'guestcontrol', vm,
    `--username=${gUser}`, `--password=${gPass}`,
    'run', '--exe=/bin/bash',
    ...(wait ? ['--wait-stdout', '--wait-stderr'] : []),
    '--', '/bin/bash', '-lc', full,
  ];
  if (label) console.log(`  · ${label}`);
  return vbox(argv, { capture: true });
}

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForGuestExec() {
  process.stdout.write('  Guest Additions 대기');
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (dryRun) { console.log(' (dry-run 건너뜀)'); return; }
    const out = vbox(['guestproperty', 'get', vm, '/VirtualBox/GuestInfo/OS/Product'], { capture: true });
    if (/Value:/.test(out)) { console.log(' ok'); return; }
    process.stdout.write('.');
    await sleep(5000);
  }
  throw new Error('Guest Additions 가 뜨지 않습니다 (guestcontrol 불가).');
}

async function waitForInstallReady() {
  console.log(`  설치 완료 대기 (최대 ${readyTimeoutSec}s)`);
  const deadline = Date.now() + readyTimeoutSec * 1000;
  const check = `cd ${shq(repoDir)} && (SUDO docker compose -f infra/b2b/docker-compose.yml ps --format '{{.State}}' 2>/dev/null || SUDO docker ps --format '{{.Status}}') | tr '\\n' ' '`;
  while (Date.now() < deadline) {
    if (dryRun) { console.log('  (dry-run 건너뜀)'); return; }
    const out = guestRun(check, { wait: true });
    const states = out.trim();
    if (states && !/starting|unhealthy|restarting|exited|created/i.test(states) && /running|healthy|Up /i.test(states)) {
      console.log(`  컨테이너 상태: ${states}`);
      return;
    }
    await sleep(15_000);
  }
  throw new Error('설치가 시간 내에 healthy 상태가 되지 않았습니다.');
}

// ---- guards ----
if (!vm) { console.error('vm.config.json 에 vmName 이 없습니다.'); process.exit(1); }
if (!gUser || !gPass) { console.error('vm.config.json 에 guestUser/guestPassword 가 필요합니다.'); process.exit(1); }
if (!/rec|record|demo|throwaway|disposable|test/i.test(vm) && !force) {
  console.error(`VM 이름 "${vm}" 이 폐기용처럼 보이지 않습니다. 이름에 rec/demo/test 를 넣거나 --force 를 쓰세요.`);
  process.exit(1);
}
mkdirSync(workDir, { recursive: true });
mkdirSync(inputDir, { recursive: true });

console.log(`VBoxManage: ${VBM}`);
console.log(`VM: ${vm}  (base=${baseSnap} → post=${postSnap})`);

// ---- provision (optional) ----
if (provision) {
  if (!cfg.iso || !existsSync(cfg.iso)) { console.error('--provision 에는 vm.config.json 의 iso (Ubuntu 24.04 경로) 가 필요합니다.'); process.exit(1); }
  console.log('\n[provision] 베이스 VM 무인 설치');
  vbox(['createvm', '--name', vm, '--ostype', 'Ubuntu_64', '--register']);
  vbox(['modifyvm', vm, '--memory', String(cfg.memoryMB ?? 4096), '--cpus', String(cfg.cpus ?? 2), '--nic1', 'nat', '--nic2', 'hostonly', '--graphicscontroller', 'vmsvga', '--vram', '64']);
  vbox(['createhd', '--filename', join(cfg.vmDiskDir ?? workDir, `${vm}.vdi`), '--size', String(cfg.diskMB ?? 30000)]);
  vbox(['storagectl', vm, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAHCI']);
  vbox(['storageattach', vm, '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', join(cfg.vmDiskDir ?? workDir, `${vm}.vdi`)]);
  vbox(['unattended', 'install', vm,
    `--iso=${cfg.iso}`,
    `--user=${gUser}`, `--full-user-name=${gUser}`, `--password=${gPass}`,
    '--install-additions', '--time-zone=Asia/Seoul',
    '--post-install-command=apt-get update && apt-get install -y git ca-certificates curl',
    '--start-vm=headless']);
  console.log('무인 설치가 시작되었습니다. 완료까지 15~30분. 완료 후 게스트에서:');
  console.log(`  VBoxManage snapshot ${vm} take ${baseSnap} --pause`);
  console.log('그다음 --provision 없이 다시 실행하세요.');
  process.exit(0);
}

// ---- main: restore → boot → record → install → snapshot ----
(async () => {
  console.log('\n[1] 베이스 스냅샷 복원');
  vbox(['controlvm', vm, 'poweroff'], { capture: true }); // 이미 꺼져 있으면 무시
  await sleep(1500);
  vbox(['snapshot', vm, 'restore', baseSnap]);

  console.log('[2] 헤드리스 부팅');
  vbox(['startvm', vm, '--type', 'headless']);
  await waitForGuestExec();

  console.log('[3] 저장소 clone');
  guestRun(`rm -rf ${shq(repoDir)} && git clone --depth 1 ${shq(repoUrl)} ${shq(repoDir)}`, { label: 'git clone' });

  console.log('[4] 화면 녹화 시작');
  vbox(['controlvm', vm, 'recording', 'screens', 'all']);
  vbox(['controlvm', vm, 'recording', 'filename', recFileAbs.replace(/\\/g, '/')]);
  vbox(['controlvm', vm, 'recording', 'videores', rec.videores]);
  vbox(['controlvm', vm, 'recording', 'videofps', String(rec.videofps)]);
  vbox(['controlvm', vm, 'recording', 'videorate', String(rec.videorate)]);
  vbox(['controlvm', vm, 'recording', 'start']);
  await sleep(2000); // 앞 여유 프레임

  console.log('[5] installer 실행 (stdout → output/assemble/install-log.txt)');
  const log = guestRun(`cd ${shq(repoDir)} && SUDO ./installer/install-virtualbox.sh 2>&1`, { label: 'install-virtualbox.sh', wait: true });
  if (!dryRun) writeFileSync(join(workDir, 'install-log.txt'), log, 'utf8');

  await waitForInstallReady();

  console.log('[6] 로그인 페이지 확인 (콘솔에 잠깐 표시)');
  guestRun(`for i in 1 2 3; do curl -sk https://localhost/ -o /dev/null -w 'HTTPS %{http_code}\\n' || true; sleep 1; done`, { label: 'curl https://localhost' });
  await sleep(3000); // 뒤 여유 프레임

  console.log('[7] 녹화 종료');
  vbox(['controlvm', vm, 'recording', 'stop']);
  await sleep(1500);

  console.log(`[8] 스냅샷 ${postSnap}`);
  vbox(['snapshot', vm, 'take', postSnap, '--description=On-Premise install complete, pre-recording data prep', '--live'], { capture: true });

  if (!keepRunning) {
    console.log('[9] VM 종료');
    vbox(['controlvm', vm, 'poweroff'], { capture: true });
  } else {
    console.log('[9] --keep-running: VM 유지 (Playwright chapter 녹화용)');
  }

  if (!dryRun) {
    if (existsSync(recFileAbs)) {
      renameSync(recFileAbs, finalAbs);
      console.log(`\n완료: ${finalAbs}`);
      console.log('다음: chapter webm 녹화 후  npm run assemble');
    } else {
      console.warn(`\n녹화 파일을 못 찾음: ${recFileAbs}`);
      console.warn('VM 폴더의 .webm 을 직접 video/input/install-raw.webm 로 옮기세요.');
    }
  } else {
    console.log('\n(--dry-run: 실제 실행 안 함)');
  }
})().catch((e) => {
  console.error('\n실패:', e.message);
  if (!dryRun && !keepRunning) { try { execFileSync(VBM, ['controlvm', vm, 'poweroff']); } catch { /* noop */ } }
  process.exit(1);
});
