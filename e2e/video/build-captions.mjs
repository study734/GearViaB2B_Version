#!/usr/bin/env node
// captions.json -> SRT
//
//   node video/build-captions.mjs
//       clip 별 SRT 를 output/captions/<clip>.srt 로 생성 (시간 = clip 시작 기준).
//       편집기에서 각 클립에 해당 SRT 를 얹는다. 재촬영으로 클립 길이가 바뀌면
//       captions.json 의 startSec/endSec 만 수정 후 재실행 (타임라인 수작업 없음).
//
//   node video/build-captions.mjs --timeline video/timeline.json
//       최종 편집본에서 각 clip 의 시작 offset(초)을 적은 JSON 을 받아
//       output/captions/final.srt (절대 시간) 를 생성. ffmpeg -vf subtitles=final.srt 로 굽는다.
//       timeline.json 예: { "title": 0, "install": 8, "ch01-admin-login": 36, ... }
//
// 의존성 없음. Node 18+.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(here, '..');
const srcPath = join(here, 'captions.json');
const outDir = join(e2eDir, 'output', 'captions');
const marksDir = join(e2eDir, 'output', 'marks');

const args = process.argv.slice(2);
const timelineIdx = args.indexOf('--timeline');
const timelinePath = timelineIdx !== -1 ? resolve(args[timelineIdx + 1]) : null;

/** @type {{clips:string[],minDurationSec:number,maxLines:number,captions:Array<{id:string,clip:string,startSec:number,endSec:number,mark:string,offsetSec:number,durSec:number,text:string,_raw?:boolean}>}} */
const doc = JSON.parse(readFileSync(srcPath, 'utf8'));

// mark 기반 캡션 해석: { clip, mark, offsetSec?, durSec? } -> raw clip 시간(startSec/endSec).
// _raw=true 로 표시해 timeline 모드에서 clip inSec 을 빼도록 한다.
function loadMarks(clip) {
  const p = join(marksDir, `${clip}.txt`);
  if (!existsSync(p)) return null;
  const m = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const [label, sec] = line.split('\t');
    if (label && sec) m[label.trim()] = Number(sec);
  }
  return m;
}
const marksCache = {};
for (const c of doc.captions ?? []) {
  if (!c.mark) continue;
  const marks = marksCache[c.clip] ?? (marksCache[c.clip] = loadMarks(c.clip));
  if (!marks || marks[c.mark] == null) {
    console.error(`자막 ${c.id}: mark "${c.mark}" 를 output/marks/${c.clip}.txt 에서 찾지 못했습니다.`);
    process.exit(1);
  }
  c.startSec = Number((marks[c.mark] + (c.offsetSec ?? 0)).toFixed(3));
  c.endSec = Number((c.startSec + (c.durSec ?? 4)).toFixed(3));
  c._raw = true;
}
const minDur = doc.minDurationSec ?? 2.5;
const maxLines = doc.maxLines ?? 2;
const clipOrder = doc.clips ?? [];

const errors = [];
const warnings = [];

if (!Array.isArray(clipOrder) || clipOrder.length === 0) {
  errors.push('captions.json: "clips" 배열이 비어 있습니다.');
}
const clipSet = new Set(clipOrder);
const seenIds = new Set();

for (const c of doc.captions ?? []) {
  if (!c.id) errors.push(`캡션에 id 가 없습니다: ${JSON.stringify(c)}`);
  if (seenIds.has(c.id)) errors.push(`중복 id: ${c.id}`);
  seenIds.add(c.id);
  if (!clipSet.has(c.clip)) errors.push(`${c.id}: 알 수 없는 clip "${c.clip}" (clips 배열에 추가하세요)`);
  if (typeof c.startSec !== 'number' || typeof c.endSec !== 'number') {
    errors.push(`${c.id}: startSec/endSec 는 숫자여야 합니다.`);
    continue;
  }
  if (c.endSec <= c.startSec) errors.push(`${c.id}: endSec(${c.endSec}) 가 startSec(${c.startSec}) 이하입니다.`);
  if (c.startSec < 0) errors.push(`${c.id}: startSec 가 음수입니다.`);
  if (c.endSec - c.startSec < minDur) {
    warnings.push(`${c.id}: 표시 시간 ${(c.endSec - c.startSec).toFixed(1)}s < 권장 ${minDur}s`);
  }
  const lines = String(c.text ?? '').split('\n');
  if (lines.length > maxLines) warnings.push(`${c.id}: ${lines.length}줄 (권장 ${maxLines}줄 이하)`);
  if (lines.some((l) => l.trim() === '')) warnings.push(`${c.id}: 빈 줄이 포함되어 있습니다.`);
}

// clip 내 시간 겹침 검사
for (const clip of clipOrder) {
  const inClip = (doc.captions ?? [])
    .filter((c) => c.clip === clip)
    .sort((a, b) => a.startSec - b.startSec);
  for (let i = 1; i < inClip.length; i++) {
    if (inClip[i].startSec < inClip[i - 1].endSec) {
      warnings.push(`${clip}: "${inClip[i - 1].id}" 와 "${inClip[i].id}" 표시 시간이 겹칩니다.`);
    }
  }
}

if (errors.length) {
  console.error('자막 검증 실패:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
for (const w of warnings) console.warn('경고: ' + w);

function srtTime(totalSec) {
  if (totalSec < 0) totalSec = 0;
  const ms = Math.round(totalSec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(millis, 3)}`;
}

function toSrt(entries) {
  // entries: [{startSec, endSec, text}] 이미 정렬됨
  return entries
    .map((e, i) => `${i + 1}\n${srtTime(e.startSec)} --> ${srtTime(e.endSec)}\n${e.text}\n`)
    .join('\n');
}

mkdirSync(outDir, { recursive: true });

if (timelinePath) {
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
  // 구/신 포맷 모두 허용: number | { start, inSec }
  const tstart = (c) => (typeof timeline[c] === 'number' ? timeline[c] : timeline[c]?.start);
  const tin = (c) => (typeof timeline[c] === 'number' ? 0 : (timeline[c]?.inSec ?? 0));
  const missing = clipOrder.filter((c) => typeof tstart(c) !== 'number');
  if (missing.length) {
    console.error(`timeline JSON 에 start 가 없는 clip: ${missing.join(', ')}`);
    process.exit(1);
  }
  const merged = (doc.captions ?? [])
    .map((c) => {
      // mark 기반(_raw)은 clip 원본 시간이므로 잘라낸 inSec 을 뺀다.
      const rel = c._raw ? { s: c.startSec - tin(c.clip), e: c.endSec - tin(c.clip) } : { s: c.startSec, e: c.endSec };
      return { startSec: tstart(c.clip) + rel.s, endSec: tstart(c.clip) + rel.e, text: c.text };
    })
    .filter((e) => e.endSec > e.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const outPath = join(outDir, 'final.srt');
  writeFileSync(outPath, toSrt(merged), 'utf8');
  console.log(`final.srt 생성: ${outPath} (${merged.length} cue)`);
  console.log(`굽기 예: ffmpeg -i onprem-cut.mp4 -vf "subtitles=${outPath.replace(/\\/g, '/')}" onprem-final.mp4`);
} else {
  let count = 0;
  for (const clip of clipOrder) {
    const inClip = (doc.captions ?? [])
      .filter((c) => c.clip === clip)
      .sort((a, b) => a.startSec - b.startSec)
      .map((c) => ({ startSec: c.startSec, endSec: c.endSec, text: c.text }));
    if (inClip.length === 0) continue;
    const outPath = join(outDir, `${clip}.srt`);
    writeFileSync(outPath, toSrt(inClip), 'utf8');
    count += inClip.length;
    console.log(`${clip}.srt (${inClip.length} cue)`);
  }
  console.log(`\nclip SRT ${clipOrder.length}개 대상, cue ${count}개 -> ${outDir}`);
  console.log('최종 절대 시간 SRT 가 필요하면: node video/build-captions.mjs --timeline video/timeline.json');
}
