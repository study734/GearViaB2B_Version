import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const e2eDir = resolve(scriptDir, '..');
const resultsDir = join(e2eDir, 'output', 'test-results');
const targetDir = join(e2eDir, 'output', 'presentation-videos');
const target = join(targetDir, 'gearvia-onprem-full-demo.webm');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.name.endsWith('.webm')) files.push(path);
  }
  return files;
}

const videos = await collect(resultsDir);
if (videos.length === 0) throw new Error(`No Playwright video found under ${resultsDir}`);
const fullVideos = videos.filter((path) => path.toLowerCase().includes('full-demo'));
const candidates = fullVideos.length > 0 ? fullVideos : videos;
const videosWithStats = await Promise.all(candidates.map(async (path) => ({ path, mtimeMs: (await stat(path)).mtimeMs })));
videosWithStats.sort((left, right) => right.mtimeMs - left.mtimeMs);
const source = videosWithStats[0].path;
await mkdir(targetDir, { recursive: true });
await cp(source, target);
console.log(`Promoted ${basename(source)} to ${target}`);
