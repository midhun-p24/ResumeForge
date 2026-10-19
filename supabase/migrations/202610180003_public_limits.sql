-- Public multi-user bounds. All quotas are checked transactionally, including
-- concurrent requests, and apply to cancelled/failed work as well as successes.
create index if not exists pairing_expiry on public.pairing_requests(expires_at);
create index if not exists rates_expiry on public.rate_limits(window_at);
create index if not exists tasks_owner_time on public.tasks(user_id,created_at desc);
alter table public.pairing_requests add column requester_hash text;

create function public.rf_account_bytes(p_user uuid) returns bigint
language sql stable security definer set search_path=public as $$
 select coalesce(sum(bytes),0)::bigint from (
   select pg_column_size(data)::bigint bytes from profiles where user_id=p_user
   union all select pg_column_size(data) from source_records where user_id=p_user
   union all select pg_column_size(data) from jobs where user_id=p_user
   union all select pg_column_size(data) from profile_snapshots where user_id=p_user
   union all select pg_column_size(data) from job_snapshots where user_id=p_user
   union all select pg_column_size(input)+coalesce(pg_column_size(draft),0) from tasks where user_id=p_user
   union all select pg_column_size(output)+pg_column_size(profile) from resume_versions where user_id=p_user
 ) data_rows;
$$;

create function public.rf_public_bound() returns trigger
language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=new.user_id; begin
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 if tg_table_name='jobs' and (select count(*) from jobs where user_id=owner_id)>=250 then
   raise exception 'ACCOUNT_LIMIT';
 elsif tg_table_name='tasks' then
   if (select count(*) from tasks where user_id=owner_id)>=1000 then raise exception 'ACCOUNT_LIMIT';end if;
   if (select count(*) from tasks where user_id=owner_id and created_at>now()-interval '1 day')>=50 or
      (select count(*) from tasks where user_id=owner_id and created_at>now()-interval '1 hour')>=20 then
     raise exception 'TASK_LIMIT';
   end if;
   if (select count(*) from tasks where user_id=owner_id and state in ('queued','running'))>=3 then
     raise exception 'QUEUE_FULL';
   end if;
 elsif tg_table_name='resume_versions' and (select count(*) from resume_versions where user_id=owner_id)>=1000 then
   raise exception 'ACCOUNT_LIMIT';
 elsif tg_table_name='agent_devices' then
   if (select count(*) from agent_devices where user_id=owner_id and revoked_at is null)>=5 or
      (select count(*) from agent_devices where user_id=owner_id)>=50 then raise exception 'DEVICE_LIMIT';end if;
 elsif tg_table_name='artifacts' then
   if new.size_bytes<0 or new.size_bytes>2097152 then raise exception 'STORAGE_LIMIT';end if;
   if (select coalesce(sum(size_bytes),0) from artifacts where user_id=owner_id)+new.size_bytes>104857600 then
     raise exception 'STORAGE_LIMIT';
   end if;
 end if;
 if public.rf_account_bytes(owner_id)+pg_column_size(to_jsonb(new))>20971520 then
   raise exception 'ACCOUNT_LIMIT';
 end if;
 return new;
end $$;

do $$ declare t text;begin
 foreach t in array array['profiles','source_records','jobs','profile_snapshots','job_snapshots',
   'tasks','resume_versions','agent_devices','artifacts'] loop
   execute format('create trigger public_insert_bound before insert on public.%I for each row execute function public.rf_public_bound()',t);
 end loop;
end $$;
-- Profile updates already hold the same account lock in rf_save_profile.
create trigger profile_size_bound before update of data on public.profiles
for each row execute function public.rf_public_bound();

create function public.rf_start_pair(p_requester text,p_code text,p_poll text,p_token text,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p pairing_requests;begin
 perform pg_advisory_xact_lock(hashtextextended('resumeforge-pair-capacity',0));
 delete from pairing_requests where expires_at<now()-interval '1 day';
 if (select count(*) from pairing_requests where expires_at>now() and consumed_at is null)>=500 or
    (select count(*) from pairing_requests where requester_hash=p_requester and expires_at>now() and consumed_at is null)>=3 then
   raise exception 'PAIR_LIMIT';
 end if;
 insert into pairing_requests(requester_hash,code_hash,poll_hash,token_hash,name)
 values(p_requester,p_code,p_poll,p_token,p_name) returning * into p;
 return jsonb_build_object('id',p.id,'expires_at',p.expires_at);
end $$;

create or replace function public.rf_rate(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;begin
 if p_limit<1 or p_seconds<1 or p_seconds>86400 then raise exception 'INVALID_RATE';end if;
 -- Bounded sweeping indexed by window_at; attacker-controlled poll IDs no longer create keys.
 delete from rate_limits where key in (select key from rate_limits where window_at<now()-interval '2 days' limit 200);
 insert into rate_limits(key,hits) values(p_key,1) on conflict(key) do update set
   hits=case when rate_limits.window_at<now()-make_interval(secs=>p_seconds) then 1 else least(rate_limits.hits+1,p_limit+1) end,
   window_at=case when rate_limits.window_at<now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_at end
 returning hits into n;
 return n<=p_limit;
end $$;

create function public.rf_bound_events() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 -- Callers already hold the task/device row lock. A malicious device cannot grow
 -- event history forever by alternating otherwise-valid stage names.
 if (select count(*) from task_events where task_id=new.task_id)>=100 then raise exception 'EVENT_LIMIT';end if;
 return new;
end $$;
create trigger public_event_bound before insert on public.task_events
for each row execute function public.rf_bound_events();

-- New functions never inherit PUBLIC execution permissions.
revoke all on function public.rf_account_bytes(uuid),public.rf_public_bound(),
 public.rf_start_pair(text,text,text,text,text),public.rf_bound_events() from public,anon,authenticated;
grant execute on function public.rf_account_bytes(uuid),public.rf_public_bound(),
 public.rf_start_pair(text,text,text,text,text),public.rf_bound_events() to service_role;
