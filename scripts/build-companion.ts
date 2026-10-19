import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Publish only this explicit runtime bundle and generated manifest, never the repository.
const version = '0.2.0';
const output = resolve('.companion-build/package');
const downloads = resolve('apps/web/public/downloads');
await mkdir(join(output, 'bin'), { recursive: true });
await mkdir(downloads, { recursive: true });
const dependencies = [
  '@openai/codex',
  '@openai/codex-sdk',
  '@napi-rs/keyring',
  'pdf-lib',
  'pdfjs-dist',
  'zod',
];
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const pinned = Object.fromEntries(
  dependencies.map((name) => [name, lock.packages[`node_modules/${name}`].version]),
);
await build({
  entryPoints: ['apps/companion/src/index.ts'],
  outfile: join(output, 'bin/resumeforge.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: dependencies,
  legalComments: 'inline',
  banner: { js: '#!/usr/bin/env node' },
});
await writeFile(
  join(output, 'package.json'),
  JSON.stringify(
    {
      name: 'resumeforge-companion',
      version,
      private: true,
      type: 'module',
      license: 'UNLICENSED',
      description: 'ResumeForge outbound local Codex companion',
      engines: { node: '>=22.14' },
      bin: { resumeforge: 'bin/resumeforge.mjs' },
      files: ['bin', 'README.md'],
      dependencies: pinned,
    },
    null,
    2,
  ),
);
await writeFile(
  join(output, 'README.md'),
  '# ResumeForge companion\n\nInstructions: https://resume-forge.midoon.dev/companion\n\nRun resumeforge doctor, resumeforge warmup, resumeforge pair, then resumeforge run.\nEach person uses their own local Codex sign-in. No shared owner account is used.\nNode 22.14+, an OS credential vault, and local Tectonic are required.\n',
);
const npmCli =
  process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const packed = JSON.parse(
  execFileSync(
    process.execPath,
    [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', downloads],
    { cwd: output, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ),
);
const allowed = new Set(['package.json', 'README.md', 'bin/resumeforge.mjs']);
if (
  packed.length !== 1 ||
  packed[0].files.some((file: { path: string }) => !allowed.has(file.path))
)
  throw new Error('Unexpected file in companion package');
const filename = `resumeforge-companion-${version}.tgz`;
const bytes = await readFile(join(downloads, filename));
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(join(downloads, filename + '.sha256'), `${sha256}  ${filename}\n`);
await writeFile(
  join(downloads, 'companion.json'),
  JSON.stringify(
    {
      version,
      filename,
      sha256,
      bytes: bytes.length,
      requires: { node: '22.14+', codex: 'ChatGPT sign-in', tectonic: '0.17+' },
    },
    null,
    2,
  ),
);
console.log(
  `Built allowlisted companion ${version} (${bytes.length} bytes); no private repository access required.`,
);
