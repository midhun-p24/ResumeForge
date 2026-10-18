import { mkdtemp,mkdir,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fixture } from '../tests/fixtures';
import { CodexAdapter } from '../apps/companion/src/adapter';
import { compileResume } from '../apps/companion/src/render';
import { validateEvidence } from '@resumeforge/contracts';

const root=resolve('private','smoke');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'codex-'));
const {input}=fixture();const adapter=new CodexAdapter();
console.log(`Local sign-in: ${await adapter.status()}. Synthetic input only.`);
const signal=AbortSignal.timeout(180000);
const output=await adapter.run(input,dir,signal,async stage=>{console.log(stage);}).catch(e=>{console.error('Synthetic smoke diagnostic:',e.cause instanceof Error?e.cause.message:e.code);throw e;});
if(validateEvidence(input,output).length)throw new Error('Evidence validation failed');
await writeFile(join(dir,'result.json'),JSON.stringify(output,null,2));
console.log('Live Codex structured tailoring passed.');
if(process.argv.includes('--pdf')){
  const rendered=await compileResume(input.profile,output,dir,signal,async stage=>{console.log(stage);},process.argv.includes('--warmup'));
  console.log(JSON.stringify(rendered.render));
  if(rendered.render.status!=='ready')process.exitCode=1;
}
