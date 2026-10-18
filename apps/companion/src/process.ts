import { spawn } from 'node:child_process';
import { homedir } from 'node:os';

/** Never inherit service keys, API keys, device tokens, or a parent agent's tools. */
export function localEnvironment():Record<string,string> {
  const allowed=['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOMEDRIVE','HOMEPATH','HOME','LOCALAPPDATA','APPDATA','CODEX_HOME','SSL_CERT_FILE','SSL_CERT_DIR'];
  const env:Record<string,string>={};for(const k of allowed)if(process.env[k])env[k]=process.env[k]!;
  return {...env,HOME:env.HOME||homedir(),USERPROFILE:env.USERPROFILE||homedir()};
}
export function execFile(file:string,args:string[],options:{cwd?:string;env?:Record<string,string>;signal?:AbortSignal;timeout?:number}={}) {
  return new Promise<{stdout:string;stderr:string;code:number}>((resolve,reject)=>{
    const child=spawn(file,args,{cwd:options.cwd,env:options.env??localEnvironment(),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal:options.signal});
    let stdout='',stderr='',done=false;
    const finish=(error?:Error,code=1)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve({stdout,stderr,code});};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('TIMEOUT'));},options.timeout??30000);
    for(const [stream,name] of [[child.stdout,'stdout'],[child.stderr,'stderr']] as const)stream.on('data',(chunk:Buffer)=>{
      if(name==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();
      if(stdout.length+stderr.length>2000000){child.kill('SIGKILL');finish(new Error('OUTPUT_LIMIT'));}
    });
    child.on('error',e=>finish(e));child.on('close',code=>finish(undefined,code??1));
  });
}
