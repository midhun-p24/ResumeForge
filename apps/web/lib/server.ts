import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export function db() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new ApiError(503,'SETUP_REQUIRED','Configure Supabase and apply the ResumeForge migration.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export async function userFor(request:Request) {
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!token) throw new ApiError(401,'SIGN_IN_REQUIRED','Sign in to continue.');
  const {data,error}=await db().auth.getUser(token);
  if(error||!data.user) throw new ApiError(401,'SESSION_EXPIRED','Sign in again.');
  return data.user;
}
export async function deviceFor(request:Request) {
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!token||!/^rf_[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401,'DEVICE_AUTH','Pair this companion in ResumeForge.');
  const {data,error}=await db().from('agent_devices').select('id,user_id,revoked_at').eq('token_hash',hash(token)).maybeSingle();
  if(error||!data||data.revoked_at) throw new ApiError(401,'DEVICE_REVOKED','Device disconnected. Pair again in ResumeForge.');
  return data;
}
export function checked<T>({data,error}:{data:T;error:{message:string}|null}):NonNullable<T> {
  if(error) {
    const known=['PAIR_INVALID','DEVICE_REVOKED','LEASE_LOST','QUEUE_FULL','NOT_FOUND','ARTIFACT_OWNER'];
    const code=known.find(c=>error.message.includes(c));
    if(code) throw new ApiError(code==='NOT_FOUND'?404:409,code,{
      PAIR_INVALID:'Pairing code expired, already used, or incorrect. Start pairing again.',
      DEVICE_REVOKED:'Device disconnected. Pair again.',LEASE_LOST:'Task lease expired or the task was cancelled.',
      QUEUE_FULL:'Finish or cancel queued tasks before adding more.',NOT_FOUND:'Record not found.',ARTIFACT_OWNER:'Artifact ownership check failed.'
    }[code]!);
    throw new ApiError(500,'DATABASE_ERROR','Database operation failed. Check the migration and server configuration.');
  }
  return data as NonNullable<T>;
}
export async function rate(key:string,limit:number,seconds=600) {
  const ok=checked(await db().rpc('rf_rate',{p_key:hash(key),p_limit:limit,p_seconds:seconds}));
  if(!ok) throw new ApiError(429,'RATE_LIMIT','Too many requests. Try again later.');
}
export async function body(request:Request,max=3500000):Promise<unknown> {
  if(Number(request.headers.get('content-length')||0)>max) throw new ApiError(413,'TOO_LARGE','Request is too large.');
  if(!request.body) return {};
  const reader=request.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  for(;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new ApiError(413,'TOO_LARGE','Request is too large.');}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'INVALID_JSON','Expected JSON.');}
}
export async function owned(table:string,id:string,userId:string) {
  const row=checked(await db().from(table).select('*').eq('id',id).eq('user_id',userId).maybeSingle());
  if(!row) throw new ApiError(404,'NOT_FOUND','Record not found.');
  return row;
}
