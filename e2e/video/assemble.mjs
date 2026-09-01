#!/usr/bin/env node
// segments.json -> onprem-final.mp4  (ffmpeg 조립 파이프라인)
//
//   node video/assemble.mjs [--dry-run] [--reencode-concat] [--no-subs]
//
// 하는 일:
//   1. segments.json 을 읽어 각 세그먼트의 최종 길이를 계산
//   2. 자막 타임라인(output/assemble/timeline.json)을 자동 생성하고
//      build-captions.mjs --timeline 로 output/captions/final.srt 를 굽는다
//   3. 세그먼트별로 ffmpeg 정규화(1920x1080/30fps/yuv420p/무음):
//        - card         : 배경색 + drawtext
//        - clip         : trim + scale/pad
//        - clip-ramped  : parts 별 배속(setpts) 후 이어붙임
//   4. 전체 concat -> output/assemble/onprem-cut.mp4
//   5. final.srt 를 구워 output/assemble/onprem-final.mp4
//
// 입력 클립은 e2e/video/input/ 에 둔다 (gitignore 아래 output/ 과 달리 직접 관리).
// ffmpeg 은 libass 포함 빌드여야 한다: `ffmpeg -version | grep libass`.
//
// 재촬영: 해당 webm 만 교체(또는 segments.json 의 inSec/outSec 조정) 후 재실행.
// 편집기·타임라인 드래그 없음.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(here, '..');
const cfgPath = join(here, 'segments.json');
const workDir = join(e2eDir, 'output', 'assemble');
const srtRel = 'output/captions/final.srt';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const reencodeConcat = args.includes('--reencode-concat');
const noSubs = args.includes('--no-subs');

const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const W = cfg.output?.width ?? 1920;
const H = cfg.output?.height ?? 1080;
const FPS = cfg.output?.fps ?? 30;
const outFileRel = cfg.output?.file ?? 'output/assemble/onprem-final.mp4';

const ff = (filterOrArgs, label) => {
  if (dryRun) { console.log(`  [ffmpeg] ${label}`); return; }
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...filterOrArgs], {
    cwd: e2eDir,
    stdio: 'inherit',
  });
};

// filtergraph 안에서 Windows 경로의 콜론/역슬래시 이스케이프
const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

function segDuration(s) {
  if (s.type === 'card') return Number(s.durationSec);
  if (s.type === 'clip') return (Number(s.outSec) - Number(s.inSec));
  if (s.type === 'clip-ramped') {
    return s.parts.reduce((a, p) => a + (Number(p.outSec) - Number(p.inSec)) / Number(p.speed), 0);
  }
  throw new Error(`알 수 없는 segment type: ${s.type} (${s.id})`);
}

const norm = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS},setsar=1,format=yuv420p`;
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', '-r', String(FPS), '-video_track_timescale', '15360'];

// ---- 1. 검증 + 타임라인 ----
const errors = [];
if (!Array.isArray(cfg.segments) || cfg.segments.length === 0) errors.push('segments 가 비어 있습니다.');
const ids = new Set();
for (const s of cfg.segments ?? []) {
  if (!s.id) errors.push(`id 없는 segment: ${JSON.stringify(s)}`);
  if (ids.has(s.id)) errors.push(`중복 id: ${s.id}`);
  ids.add(s.id);
  if (s.type !== 'card' && !dryRun && s.source && !existsSync(resolve(e2eDir, s.source))) {
    errors.push(`${s.id}: source 없음 -> ${s.source}`);
  }
  try {
    const d = segDuration(s);
    if (!(d > 0)) errors.push(`${s.id}: 계산된 길이가 0 이하 (${d})`);
  } catch (e) { errors.push(String(e.message)); }
}
if (errors.length) {
  console.error('assemble 검증 실패:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

let t = 0;
const timeline = {};
const table = [];
for (const s of cfg.segments) {
  timeline[s.id] = Number(t.toFixed(3));
  const d = segDuration(s);
  table.push(`  ${String(timeline[s.id]).padStart(7)}s  +${d.toFixed(1).padStart(5)}s  ${s.id}  (${s.type})`);
  t += d;
}
console.log('세그먼트 타임라인:');
console.log(table.join('\n'));
console.log(`  총 길이 ≈ ${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')} (${t.toFixed(1)}s)`);
if (t < 150 || t > 200) console.warn(`경고: 총 길이 ${t.toFixed(1)}s 가 목표(2:40~3:10) 밖입니다.`);

mkdirSync(workDir, { recursive: true });
const timelinePath = join(workDir, 'timeline.json');
writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + '\n', 'utf8');
console.log(`\ntimeline.json -> ${timelinePath}`);

// ---- 2. 자막 굽기 소스 ----
if (!noSubs) {
  if (dryRun) console.log('  [build-captions] --timeline output/assemble/timeline.json');
  else execFileSync(process.execPath, [join(here, 'build-captions.mjs'), '--timeline', timelinePath], { cwd: e2eDir, stdio: 'inherit' });
}

// ---- 3. 세그먼트 렌더 ----
const segFiles = [];
cfg.segments.forEach((s, i) => {
  const outRel = `output/assemble/seg-${String(i).padStart(2, '0')}-${s.id}.mp4`;
  segFiles.push(outRel);
  console.log(`\n[${i + 1}/${cfg.segments.length}] ${s.id}`);

  if (s.type === 'card') {
    const txtRel = `output/assemble/seg-${String(i).padStart(2, '0')}-${s.id}.txt`;
    if (!dryRun) writeFileSync(resolve(e2eDir, txtRel), String(s.text ?? ''), 'utf8');
    const c = cfg.card ?? {};
    const draw = [
      `drawtext=fontfile='${esc(c.fontFile ?? 'C:/Windows/Fonts/malgun.ttf')}'`,
      `textfile='${txtRel}'`,
      `fontcolor=${c.fontColor ?? 'white'}`,
      `fontsize=${c.fontSize ?? 60}`,
      `line_spacing=${c.lineSpacing ?? 18}`,
      `x=(w-text_w)/2`, `y=(h-text_h)/2`,
    ].join(':');
    ff([
      '-f', 'lavfi', '-i', `color=c=${(cfg.card?.bg) ?? 'black'}:s=${W}x${H}:r=${FPS}:d=${s.durationSec}`,
      '-vf', `${draw},format=yuv420p`, ...ENC, outRel,
    ], `card ${s.id} (${s.durationSec}s)`);
    return;
  }

  if (s.type === 'clip') {
    const dur = (Number(s.outSec) - Number(s.inSec)).toFixed(3);
    ff([
      '-ss', String(s.inSec), '-t', dur, '-i', s.source,
      '-map', '0:v:0', '-vf', `setpts=PTS-STARTPTS,${norm}`,
      ...ENC, outRel,
    ], `clip ${s.id} [${s.inSec}-${s.outSec}]`);
    return;
  }

  // clip-ramped
  const partFiles = [];
  s.parts.forEach((p, k) => {
    const pf = `output/assemble/seg-${String(i).padStart(2, '0')}-${s.id}-p${k}.mp4`;
    partFiles.push(pf);
    const dur = (Number(p.outSec) - Number(p.inSec)).toFixed(3);
    const pts = Number(p.speed) === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(1/${p.speed})*(PTS-STARTPTS)`;
    ff([
      '-ss', String(p.inSec), '-t', dur, '-i', s.source,
      '-map', '0:v:0', '-vf', `${pts},${norm}`,
      ...ENC, pf,
    ], `  part${k} ${p.inSec}-${p.outSec} @${p.speed}x`);
  });
  const listRel = `output/assemble/seg-${String(i).padStart(2, '0')}-${s.id}.txt`;
  if (!dryRun) writeFileSync(resolve(e2eDir, listRel), partFiles.map((f) => `file '${resolve(e2eDir, f).replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf8');
  ff(['-f', 'concat', '-safe', '0', '-i', listRel, '-c', 'copy', outRel], `join ${s.parts.length} parts -> ${s.id}`);
});

// ---- 4. 전체 concat ----
const cutRel = 'output/assemble/onprem-cut.mp4';
if (reencodeConcat) {
  const inputs = segFiles.flatMap((f) => ['-i', f]);
  const fc = segFiles.map((_, i) => `[${i}:v]`).join('') + `concat=n=${segFiles.length}:v=1:a=0[v]`;
  ff([...inputs, '-filter_complex', fc, '-map', '[v]', ...ENC, cutRel], `concat (re-encode) ${segFiles.length} segs`);
} else {
  const listRel = 'output/assemble/concat.txt';
  if (!dryRun) writeFileSync(resolve(e2eDir, listRel), segFiles.map((f) => `file '${resolve(e2eDir, f).replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf8');
  ff(['-f', 'concat', '-safe', '0', '-i', listRel, '-c', 'copy', cutRel], `concat (copy) ${segFiles.length} segs`);
}

// ---- 5. 자막 굽기 ----
if (noSubs) {
  console.log(`\n완료 (자막 없음): ${cutRel}`);
} else {
  const style = cfg.subtitle?.forceStyle;
  const srt = cfg.subtitle?.srt ?? srtRel;
  const vf = style
    ? `subtitles=${srt}:force_style='${style}'`
    : `subtitles=${srt}`;
  ff(['-i', cutRel, '-vf', vf, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', outFileRel], `burn subtitles -> ${outFileRel}`);
  console.log(`\n완료: ${join(e2eDir, outFileRel)}`);
}

if (dryRun) console.log('\n(--dry-run: ffmpeg 미실행. 타임라인/자막만 생성)');
