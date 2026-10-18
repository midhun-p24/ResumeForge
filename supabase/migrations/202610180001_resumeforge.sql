-- ResumeForge: all browser writes go through authenticated server endpoints.
create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null, updated_at timestamptz not null default now()
);
create table public.source_records (
  id uuid not null, user_id uuid not null references auth.users on delete cascade,
  data jsonb not null, primary key(user_id,id)
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  data jsonb not null, created_at timestamptz not null default now(), unique(user_id,id)
);
create table public.agent_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
  name text not null, token_hash text not null unique, last_seen timestamptz,
  agent_status text not null default 'unknown', revoked_at timestamptz,
  created_at timestamptz not null default now(), unique(user_id,id)
);
create table public.pairing_requests (
  id uuid primary key default gen_random_uuid(), code_hash text not null unique,
  poll_hash text not null, token_hash text not null, name text not null,
  expires_at timestamptz not null default now()+interval '10 minutes',
  user_id uuid references auth.users on delete cascade, device_id uuid references public.agent_devices on delete cascade,
  consumed_at timestamptz, created_at timestamptz not null default now()
);
create table public.profile_snapshots (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
  data jsonb not null,created_at timestamptz not null default now(),unique(user_id,id)
);
create table public.job_snapshots (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null, data jsonb not null,created_at timestamptz not null default now(),
  foreign key(user_id,job_id) references public.jobs(user_id,id) on delete cascade,unique(user_id,id)
);
create table public.tasks (
  id uuid primary key,user_id uuid not null references auth.users on delete cascade,job_id uuid not null,
  profile_snapshot_id uuid not null,job_snapshot_id uuid not null,
  input jsonb not null,state text not null default 'queued' check(state in ('queued','running','completed','failed','cancelled')),
  stage text not null default 'Queued',device_id uuid,lease_token uuid,lease_until timestamptz,
  attempts integer not null default 0 check(attempts between 0 and 3),error_code text,draft jsonb,
  created_at timestamptz not null default now(),completed_at timestamptz,
  foreign key(user_id,job_id) references public.jobs(user_id,id) on delete cascade,
  foreign key(user_id,profile_snapshot_id) references public.profile_snapshots(user_id,id),
  foreign key(user_id,job_snapshot_id) references public.job_snapshots(user_id,id),
  foreign key(user_id,device_id) references public.agent_devices(user_id,id),unique(user_id,id)
);
create table public.task_events (
  id bigint generated always as identity primary key,user_id uuid not null references auth.users on delete cascade,
  task_id uuid not null,stage text not null,created_at timestamptz not null default now(),
  foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade
);
create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null,task_id uuid,parent_id uuid,output jsonb not null,profile jsonb not null,render jsonb not null,
  label text not null default 'Generated version',created_at timestamptz not null default now(),
  foreign key(user_id,job_id) references public.jobs(user_id,id) on delete cascade,
  foreign key(user_id,task_id) references public.tasks(user_id,id),
  foreign key(user_id,parent_id) references public.resume_versions(user_id,id),unique(user_id,id),unique(task_id)
);
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
  version_id uuid not null,kind text not null check(kind in ('pdf','tex','json')),path text not null unique,
  filename text not null,sha256 text not null,size_bytes integer not null,
  foreign key(user_id,version_id) references public.resume_versions(user_id,id) on delete cascade,unique(version_id,kind)
);
create table public.applications (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null,stage text not null default 'Saved' check(stage in ('Saved','Tailoring','Ready to apply','Applied','Interviewing','Rejected','Offer','Withdrawn')),
  notes text not null default '',applied_at date,resume_version_id uuid,
  foreign key(user_id,job_id) references public.jobs(user_id,id) on delete cascade,
  foreign key(user_id,resume_version_id) references public.resume_versions(user_id,id),unique(user_id,job_id)
);
create table public.rate_limits (key text primary key, window_at timestamptz not null default now(),hits integer not null default 0);

create index tasks_claim on public.tasks(user_id,state,created_at);
create index events_task on public.task_events(task_id,created_at);
create index devices_owner on public.agent_devices(user_id);
create index versions_owner on public.resume_versions(user_id,created_at desc);

do $$ declare t text; begin
  foreach t in array array['profiles','source_records','jobs','agent_devices','pairing_requests','profile_snapshots','job_snapshots','tasks','task_events','resume_versions','artifacts','applications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;
-- Do not expose device hashes, pairing secrets or leases through PostgREST to browsers.
grant select on public.profiles,public.source_records,public.jobs,public.profile_snapshots,public.job_snapshots,
  public.task_events,public.resume_versions,public.artifacts,public.applications to authenticated;
grant select(id,user_id,name,last_seen,agent_status,revoked_at,created_at) on public.agent_devices to authenticated;
grant select(id,user_id,job_id,input,state,stage,attempts,error_code,draft,created_at,completed_at) on public.tasks to authenticated;
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon,authenticated;

create function public.rf_immutable() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Immutable record: insert a new version'; end $$;
create trigger immutable_versions before update on public.resume_versions for each row execute function public.rf_immutable();
create trigger immutable_profile_snapshots before update on public.profile_snapshots for each row execute function public.rf_immutable();
create trigger immutable_job_snapshots before update on public.job_snapshots for each row execute function public.rf_immutable();

create function public.rf_rate(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer; begin
  insert into rate_limits(key,hits) values(p_key,1) on conflict(key) do update set
    hits=case when rate_limits.window_at<now()-make_interval(secs=>p_seconds) then 1 else rate_limits.hits+1 end,
    window_at=case when rate_limits.window_at<now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_at end returning hits into n;
  return n<=p_limit;
end $$;

create function public.rf_save_profile(p_user uuid,p_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into profiles(user_id,data) values(p_user,p_data) on conflict(user_id) do update set data=excluded.data,updated_at=now();
  delete from source_records where user_id=p_user;
  insert into source_records(user_id,id,data) select p_user,(r->>'id')::uuid,r from jsonb_array_elements(p_data->'records') r;
end $$;

create function public.rf_save_job(p_user uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare j uuid; begin
  insert into jobs(user_id,data) values(p_user,p_data) returning id into j;
  insert into job_snapshots(user_id,job_id,data) values(p_user,j,p_data);
  insert into applications(user_id,job_id) values(p_user,j);
  return j;
end $$;

create function public.rf_approve_pair(p_user uuid,p_code_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare p pairing_requests;d uuid; begin
  select * into p from pairing_requests where code_hash=p_code_hash for update;
  if not found or p.expires_at<=now() or p.user_id is not null or p.consumed_at is not null then raise exception 'PAIR_INVALID'; end if;
  insert into agent_devices(user_id,name,token_hash) values(p_user,p.name,p.token_hash) returning id into d;
  update pairing_requests set user_id=p_user,device_id=d where id=p.id;
  return d;
end $$;

create function public.rf_consume_pair(p_id uuid,p_poll_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p pairing_requests; begin
  select * into p from pairing_requests where id=p_id and poll_hash=p_poll_hash for update;
  if not found or p.expires_at<=now() or p.consumed_at is not null then raise exception 'PAIR_INVALID'; end if;
  if p.device_id is null then return jsonb_build_object('status','pending'); end if;
  if not exists(select 1 from agent_devices where id=p.device_id and revoked_at is null) then raise exception 'DEVICE_REVOKED'; end if;
  update pairing_requests set consumed_at=now() where id=p.id;
  return jsonb_build_object('status','approved','deviceId',p.device_id);
end $$;

create function public.rf_enqueue(p_user uuid,p_job uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare ps uuid;js uuid;t uuid:=(p_input->>'taskId')::uuid;j jobs; begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into j from jobs where id=p_job and user_id=p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
  if (select count(*) from tasks where user_id=p_user and state in ('queued','running'))>=10 then raise exception 'QUEUE_FULL'; end if;
  insert into profile_snapshots(user_id,data) values(p_user,p_input->'profile') returning id into ps;
  insert into job_snapshots(user_id,job_id,data) values(p_user,p_job,p_input->'job') returning id into js;
  insert into tasks(id,user_id,job_id,profile_snapshot_id,job_snapshot_id,input) values(t,p_user,p_job,ps,js,p_input);
  update applications set stage='Tailoring' where user_id=p_user and job_id=p_job and stage in ('Saved','Ready to apply');
  insert into task_events(user_id,task_id,stage) values(p_user,t,'Queued');
  return t;
end $$;

create function public.rf_claim(p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d agent_devices;t tasks;begin
  select * into d from agent_devices where id=p_device and revoked_at is null for update;
  if not found then raise exception 'DEVICE_REVOKED'; end if;
  update agent_devices set last_seen=now() where id=d.id;
  -- A device can own only one non-expired lease.
  if exists(select 1 from tasks where device_id=d.id and state='running' and lease_until>now()) then return null; end if;
  update tasks set state='failed',stage='Failed',error_code='LEASE_EXHAUSTED' where user_id=d.user_id and state='running' and lease_until<=now() and attempts>=3;
  select * into t from tasks where user_id=d.user_id and attempts<3 and (state='queued' or (state='running' and lease_until<=now())) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update tasks set state='running',stage='Analyzing requirements',device_id=d.id,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,error_code=null where id=t.id returning * into t;
  insert into task_events(user_id,task_id,stage) values(t.user_id,t.id,t.stage);
  return jsonb_build_object('id',t.id,'input',t.input,'leaseToken',t.lease_token);
end $$;

create function public.rf_heartbeat(p_device uuid,p_task uuid,p_lease uuid,p_stage text,p_agent text) returns boolean
language plpgsql security definer set search_path=public as $$
declare s text; begin
  perform 1 from agent_devices where id=p_device and revoked_at is null for update;
  if not found then raise exception 'DEVICE_REVOKED'; end if;
  update agent_devices set last_seen=now(),agent_status=p_agent where id=p_device;
  if p_task is null then return true; end if;
  select stage into s from tasks where id=p_task and device_id=p_device and lease_token=p_lease and state='running' and lease_until>now() for update;
  if not found then return false; end if;
  update tasks set lease_until=now()+interval '90 seconds',stage=p_stage where id=p_task;
  if s is distinct from p_stage then insert into task_events(user_id,task_id,stage) select user_id,id,p_stage from tasks where id=p_task; end if;
  return true;
end $$;

create function public.rf_finish(p_device uuid,p_task uuid,p_lease uuid,p_output jsonb,p_render jsonb,p_artifacts jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t tasks;v uuid;a jsonb;begin
  perform 1 from agent_devices where id=p_device and revoked_at is null for update;
  if not found then raise exception 'DEVICE_REVOKED'; end if;
  select * into t from tasks where id=p_task and device_id=p_device and lease_token=p_lease for update;
  if not found then raise exception 'LEASE_LOST'; end if;
  if t.state='completed' then select id into v from resume_versions where task_id=t.id;return v;end if;
  if t.state<>'running' or t.lease_until<=now() then raise exception 'LEASE_LOST'; end if;
  insert into resume_versions(user_id,job_id,task_id,output,profile,render) values(t.user_id,t.job_id,t.id,p_output,t.input->'profile',p_render) returning id into v;
  for a in select * from jsonb_array_elements(p_artifacts) loop
    if left(a->>'path',length(t.user_id::text)+1)<>t.user_id::text||'/' then raise exception 'ARTIFACT_OWNER'; end if;
    insert into artifacts(user_id,version_id,kind,path,filename,sha256,size_bytes) values(t.user_id,v,a->>'kind',a->>'path',a->>'filename',a->>'sha256',(a->>'size_bytes')::int);
  end loop;
  update tasks set state='completed',stage='Complete',completed_at=now(),lease_until=null where id=t.id;
  update applications set stage=case when p_render->>'status'='ready' then 'Ready to apply' else 'Tailoring' end
    where user_id=t.user_id and job_id=t.job_id and stage in ('Saved','Tailoring','Ready to apply');
  insert into task_events(user_id,task_id,stage) values(t.user_id,t.id,'Complete');return v;
end $$;

create function public.rf_fail(p_device uuid,p_task uuid,p_lease uuid,p_code text,p_draft jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from agent_devices where id=p_device and revoked_at is null for update;
  if not found then raise exception 'DEVICE_REVOKED';end if;
  update tasks set state='failed',stage='Failed',error_code=p_code,draft=p_draft,lease_until=null where id=p_task and device_id=p_device and lease_token=p_lease and state='running' and lease_until>now();
  return found;
end $$;

create function public.rf_save_version(p_user uuid,p_job uuid,p_parent uuid,p_output jsonb,p_label text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v resume_versions;n uuid;begin
  select * into v from resume_versions where id=p_parent and user_id=p_user and job_id=p_job;
  if not found then raise exception 'NOT_FOUND';end if;
  insert into resume_versions(user_id,job_id,parent_id,output,profile,render,label) values(p_user,p_job,v.id,p_output,v.profile,
    '{"status":"review_required","pageCount":0,"textVerified":false,"warnings":["Edited version needs companion rendering"]}',p_label) returning id into n;return n;
end $$;

-- Only the server's service role can execute privileged functions.
do $$ declare f record;begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rf_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('resume-artifacts','resume-artifacts',false,2097152,array['application/pdf','application/json','application/x-tex']) on conflict(id) do nothing;
-- Browser receives only short-lived URLs via the owner-checked server endpoint.
-- No direct Storage policy grants; service role performs all artifact operations.
