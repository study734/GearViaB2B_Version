#!/usr/bin/env node
// 텍스트 로그(install-log.txt)를 "명령 입력 → 로그 스크롤" 터미널 영상으로 렌더링한다.
// headless + SSH 설치는 VM 콘솔이 검은 화면이라, 실제 로그를 읽기 좋게 재생하는 쪽이 낫다.
// 앞부분에 제공한 installer 스크립트 명령을 또렷이 보여줘 "이 스크립트로 설치했음"을 명확히 한다.
//
//   node video/render-termlog.mjs [--in <log>] [--out <mp4>] [--dur <sec>] [--intro <sec>]

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(here, '..');
const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const inPath = resolve(e2eDir, argv('--in', 'output/assemble/install-log.txt'));
const outPath = resolve(e2eDir, argv('--out', 'video/input/install-raw.mp4'));
const scrollSec = Number(argv('--dur', 22));
const introSec = Number(argv('--intro', 6));
const W = 1920, H = 1080, FPS = 30;
const FONT = (argv('--font', 'C:/Windows/Fonts/consola.ttf')).replace(/\\/g, '/');
const FS = 22, LH = 26, PAD = 48;
const COLS = Math.floor((W - PAD * 2) / (FS * 0.55));
const BG = '0x0B0E12';
const ENC = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-video_track_timescale', '15360'];

if (!existsSync(inPath)) { console.error(`로그 없음: ${inPath}`); process.exit(1); }

const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
const workDir = join(e2eDir, 'output', 'assemble');
mkdirSync(workDir, { recursive: true });
mkdirSync(dirname(outPath), { recursive: true });
const F = esc(FONT);
const headerBar = `drawbox=x=0:y=0:w=${W}:h=44:color=0x161B22:t=fill,drawtext=fontfile='${F}':expansion=none:text='gearvia@gearvia-rec — On-Premise GearVia installer':fontcolor=0x8FA6B5:fontsize=20:x=${PAD}:y=14`;

// ── 1. intro: 제공한 스크립트 명령을 한 줄씩 보여준다 ────────────────────────
const cmds = [
  ['$ git clone https://github.com/HO-0219/GearViaB2B_Version.git', 0.4],
  ['$ cd GearViaB2B_Version', 2.0],
  ['$ sudo ./installer/install-virtualbox.sh', 3.3],
];
const introDraw = cmds.map(([text, at], i) => {
  const tf = `output/assemble/_cmd${i}.txt`;
  writeFileSync(resolve(e2eDir, tf), text, 'utf8');
  return `drawtext=fontfile='${F}':textfile='${tf}':expansion=none:fontcolor=0xE8E8E8:fontsize=${FS + 2}`
    + `:x=${PAD}:y=${70 + i * (LH + 6)}:enable='gte(t,${at})'`;
}).join(',');
const cursorBlink = `drawtext=fontfile='${F}':text='_':fontcolor=0xE8E8E8:fontsize=${FS + 2}`
  + `:x=${PAD + 12 * 40}:y=${70 + 2 * (LH + 6)}:enable='gt(mod(t*2,2),1)*gte(t,3.6)'`;
const introOut = 'output/assemble/_intro.mp4';
console.log(`intro ${introSec}s (명령 3줄)`);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${introSec}`,
  '-vf', `${introDraw},${cursorBlink},${headerBar},format=yuv420p`, ...ENC, introOut,
], { cwd: e2eDir, stdio: 'inherit' });

// ── 2. scroll: 실제 설치 로그 ──────────────────────────────────────────────
let rawText = readFileSync(inPath, 'utf8')
  .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b\][^\x07]*\x07/g, '');
const rawLines = rawText.split('\n').map((l) => {
  const parts = l.split('\r');
  return parts[parts.length - 1].replace(/[^\S]+$/, '');
});
const lines = [];
let prevNoise = '';
for (const l0 of rawLines) {
  const l = l0;
  const noiseKey = l.replace(/[0-9.]+/g, '#');
  if (noiseKey && noiseKey === prevNoise) { lines[lines.length - 1] = l; continue; }
  prevNoise = /database|Unpacking|Setting up|Preparing to unpack|^\s*#\d+ \d+\./.test(l) ? noiseKey : '';
  if (l.length <= COLS) { lines.push(l); continue; }
  for (let i = 0; i < l.length; i += COLS) lines.push(l.slice(i, i + COLS));
}
const MAX_LINES = 1400;
const shown = lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
const totalH = shown.length * LH + PAD * 2;
writeFileSync(resolve(e2eDir, 'output/assemble/_termlog.txt'), shown.join('\n') + '\n', 'utf8');

const scroll = totalH - (H - PAD);
const yExpr = `${PAD} + ${H} - (t/${scrollSec})*(${H - PAD} + ${scroll})`;
const logText = `drawtext=fontfile='${F}':textfile='output/assemble/_termlog.txt':expansion=none`
  + `:fontcolor=0xCFCFCF:fontsize=${FS}:line_spacing=${LH - FS}:x=${PAD}:y=${yExpr}`;
const scrollOut = 'output/assemble/_scroll.mp4';
console.log(`scroll ${scrollSec}s (로그 ${shown.length}줄)`);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${scrollSec}`,
  '-vf', `${logText},${headerBar},format=yuv420p`, ...ENC, scrollOut,
], { cwd: e2eDir, stdio: 'inherit' });

// ── 3. concat ────────────────────────────────────────────────────────────
const listRel = 'output/assemble/_termcat.txt';
writeFileSync(resolve(e2eDir, listRel),
  `file '${resolve(e2eDir, introOut).replace(/\\/g, '/')}'\nfile '${resolve(e2eDir, scrollOut).replace(/\\/g, '/')}'\n`, 'utf8');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'concat', '-safe', '0', '-i', listRel, '-c', 'copy', outPath,
], { cwd: e2eDir, stdio: 'inherit' });

console.log(`완료: ${outPath}  (intro ${introSec}s + scroll ${scrollSec}s = ${introSec + scrollSec}s)`);
