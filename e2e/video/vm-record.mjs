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
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
const keyPath = resolve(e2eDir, cfg.sshKey ?? 'output/assemble/vm_key');
let guestIp = cfg.guestIp ?? null; // 없으면 부팅 후 guestproperty 로 자동 감지
const repoUrl = cfg.repoUrl ?? 'https://github.com/HO-0219/GearViaB2B_Version.git';
const repoDir = cfg.repoDir ?? `/home/${gUser}/GearViaB2B_Version`;
const readyTimeoutSec = cfg.readyTimeoutSec ?? 2400;

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

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SSH_OPTS = [
  '-i', keyPath,
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'UserKnownHostsFile=/dev/null',
  '-o', 'LogLevel=ERROR',
  '-o', 'ServerAliveInterval=15',
  '-o', 'ConnectTimeout=10',
];

// SSH 로 게스트에서 스크립트 실행. NOPASSWD sudo 이므로 SUDO 토큰은 그냥 sudo.
function sshRun(script, { label = '', check = false, timeoutMs = 300_000 } = {}) {
  const full = script.replace(/\bSUDO\b/g, 'sudo ');
  if (label) console.log(`  · ${label}`);
  if (dryRun) { console.log(`    $ ssh ${gUser}@${guestIp} '<script>'`); return ''; }
  try {
    return execFileSync('ssh', [...SSH_OPTS, `${gUser}@${guestIp}`, 'bash -s'], {
      input: full, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
      timeout: timeoutMs,
    });
  } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '');
    if (check) return out;
    throw new Error(`ssh 실행 실패 (${label || 'run'}):\n${out}`);
  }
}

function resolveGuestIp() {
  if (guestIp) return guestIp;
  for (let i = 1; i <= 8; i++) {
    const out = vbox(['guestproperty', 'get', vm, `/VirtualBox/GuestInfo/Net/${i}/V4/IP`], { capture: true });
    const m = out.match(/Value:\s*([\d.]+)/);
    if (m && !m[1].startsWith('10.0.2.')) return m[1]; // NAT(10.0.2.x) 말고 host-only
  }
  return null;
}

async function waitForSsh() {
  process.stdout.write('  SSH 대기');
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (dryRun) { console.log(' (dry-run 건너뜀)'); return; }
    if (!guestIp) guestIp = resolveGuestIp();
    if (guestIp) {
      const out = sshRun('echo __ssh_ok__', { check: true });
      if (out.includes('__ssh_ok__')) { console.log(` ok (${guestIp})`); return; }
    }
    process.stdout.write('.');
    await sleep(5000);
  }
  throw new Error('SSH 로 게스트에 붙지 못했습니다.');
}

async function waitForInstallReady() {
  console.log(`  설치 완료 대기 (최대 ${readyTimeoutSec}s)`);
  const deadline = Date.now() + readyTimeoutSec * 1000;
  const check = `SUDO docker ps --format '{{.Names}}={{.Status}}' 2>/dev/null | tr '\\n' ' '`;
  while (Date.now() < deadline) {
    if (dryRun) { console.log('  (dry-run 건너뜀)'); return; }
    const states = sshRun(check, { check: true }).trim();
    const running = (states.match(/=Up /g) || []).length;
    const bad = /unhealthy|Restarting|Exited/i.test(states);
    if (running >= 3 && !bad) {
      console.log(`  컨테이너: ${states}`);
      return;
    }
    console.log(`  대기중… (${states || '컨테이너 없음'})`);
    await sleep(20_000);
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
  const vmsRoot = (cfg.vmsRoot ?? cfg.vmDiskDir ?? workDir).replace(/\\/g, '/');
  const diskPath = `${vmsRoot}/${vm}/${vm}.vdi`;
  console.log('\n[provision] 베이스 VM 무인 설치');
  vbox(['createvm', '--name', vm, '--ostype', 'Ubuntu24_LTS_64', '--basefolder', vmsRoot, '--register']);
  vbox(['modifyvm', vm,
    '--memory', String(cfg.memoryMB ?? 4096), '--cpus', String(cfg.cpus ?? 2),
    '--nic1', 'nat',
    '--nic2', 'hostonly', '--hostonlyadapter2', cfg.hostOnlyAdapter ?? 'VirtualBox Host-Only Ethernet Adapter',
    '--graphicscontroller', 'vmsvga', '--vram', '64', '--ioapic', 'on']);
  vbox(['createmedium', 'disk', `--filename=${diskPath}`, `--size=${cfg.diskMB ?? 40000}`, '--format=VDI']);
  vbox(['storagectl', vm, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAHCI', '--portcount', '2']);
  vbox(['storageattach', vm, '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', diskPath]);
  vbox(['unattended', 'install', vm,
    `--iso=${cfg.iso}`,
    `--user=${gUser}`, `--full-user-name=${gUser}`,
    `--user-password=${gPass}`, `--admin-password=${gPass}`,
    '--install-additions', '--locale=en_US', '--country=US', '--time-zone=Asia/Seoul',
    `--hostname=${vm.toLowerCase()}.local`,
    '--post-install-command=apt-get install -y git curl ca-certificates',
    '--start-vm=headless']);
  console.log('\n무인 설치가 시작되었습니다 (headless). 완료까지 20~40분.');
  console.log('진행 확인:  VBoxManage guestproperty get ' + vm + ' /VirtualBox/GuestInfo/OS/Product');
  console.log('완료(값이 나오면) 후:');
  console.log(`  VBoxManage controlvm ${vm} acpipowerbutton   # 또는 게스트에서 정상 종료`);
  console.log(`  VBoxManage snapshot ${vm} take ${baseSnap} --description="fresh Ubuntu + git + GA"`);
  console.log('그다음 --provision 없이 `npm run vm:record` 실행.');
  process.exit(0);
}

// ---- main: restore → boot(SSH) → install → 로그 캡처 → 오프라인 스냅샷 ----
// 참고: headless + SSH 설치는 VM 콘솔에 아무것도 안 그려지므로 VBox 화면 녹화는 쓰지 않는다.
// 대신 실제 install-log.txt 를 render-termlog.mjs 로 터미널 영상으로 만든다.
(async () => {
  console.log('\n[1] 베이스 스냅샷 복원');
  vbox(['controlvm', vm, 'poweroff'], { capture: true }); // 이미 꺼져 있으면 무시
  await sleep(1500);
  vbox(['snapshot', vm, 'restore', baseSnap]);

  console.log('[2] 헤드리스 부팅 + SSH 대기');
  vbox(['startvm', vm, '--type', 'headless']);
  await waitForSsh();

  console.log('[3] 저장소 clone');
  sshRun(`command -v git >/dev/null || { SUDO apt-get update -qq && SUDO apt-get install -y -qq git; }`, { label: 'ensure git' });
  sshRun(`rm -rf ${shq(repoDir)} && git clone --depth 1 ${shq(repoUrl)} ${shq(repoDir)}`, { label: 'git clone' });

  console.log('[4] installer 실행 (stdout -> output/assemble/install-log.txt)');
  const log = sshRun(`export DEBIAN_FRONTEND=noninteractive; cd ${shq(repoDir)} && SUDO -E ./installer/install-virtualbox.sh 2>&1`, { label: 'install-virtualbox.sh', check: true, timeoutMs: readyTimeoutSec * 1000 });
  if (!dryRun) writeFileSync(join(workDir, 'install-log.txt'), log, 'utf8');

  console.log('[5] 컨테이너 healthy 대기');
  await waitForInstallReady();
  sshRun(`for i in 1 2 3; do curl -sk https://localhost/ -o /dev/null -w 'HTTPS %{http_code}\\n' || true; sleep 1; done`, { label: 'curl https://localhost', check: true });

  console.log('[6] VM 정상 종료 (오프라인 스냅샷용)');
  sshRun('SUDO systemctl poweroff', { label: 'poweroff', check: true });
  const off = Date.now() + 90_000;
  while (Date.now() < off && !dryRun) {
    if (/poweroff/.test(vbox(['showvminfo', vm, '--machinereadable'], { capture: true }))) break;
    await sleep(4000);
  }
  vbox(['controlvm', vm, 'poweroff'], { capture: true }); // 혹시 남아있으면

  console.log(`[7] 오프라인 스냅샷 ${postSnap}`);
  vbox(['snapshot', vm, 'delete', postSnap], { capture: true }); // 이전 것 있으면 교체
  vbox(['snapshot', vm, 'take', postSnap, '--description=On-Premise install complete, pre data prep'], { capture: true });

  console.log('[8] 터미널 로그 영상 렌더');
  if (!dryRun) {
    try {
      execFileSync(process.execPath, [join(here, 'render-termlog.mjs')], { cwd: e2eDir, stdio: 'inherit' });
    } catch (e) { console.warn('render-termlog 실패:', e.message); }
  }
  if (keepRunning) {
    console.log('[9] --keep-running: post-install-clean 복원 후 재부팅 (chapter 녹화용)');
    if (!dryRun) { vbox(['snapshot', vm, 'restore', postSnap]); vbox(['startvm', vm, '--type', 'headless']); }
  }

  if (!dryRun) {
    const out = join(inputDir, 'install-raw.mp4');
    if (existsSync(out)) console.log(`\n완료: ${out}  (터미널 로그 영상)\n다음: chapter webm 녹화 후  npm run assemble`);
    else console.warn(`\n렌더 결과 없음. 수동: npm run render:termlog`);
  } else {
    console.log('\n(--dry-run: 실제 실행 안 함)');
  }
})().catch((e) => {
  console.error('\n실패:', e.message);
  if (!dryRun && !keepRunning) { try { execFileSync(VBM, ['controlvm', vm, 'poweroff']); } catch { /* noop */ } }
  process.exit(1);
});
