-- Profile import shares the bounded task queue, ownership, leases and revocation.
alter table public.tasks alter column job_id drop not null;
alter table public.tasks alter column job_snapshot_id drop not null;
alter table public.tasks alter column profile_snapshot_id drop not null;
alter table public.tasks add column import_applied_at timestamptz;
alter table public.tasks add constraint task_purpose check (
  (input->>'operation'='import_profile' and job_id is null and job_snapshot_id is null and profile_snapshot_id is null) or
  (input->>'operation' in ('tailor','revise','render') and job_id is not null and job_snapshot_id is not null and profile_snapshot_id is not null)
);
alter table public.agent_devices add column companion_version text;
alter table public.agent_devices add column capabilities jsonb not null default '[]';
grant select(companion_version,capabilities) on public.agent_devices to authenticated;
grant select(import_applied_at) on public.tasks to authenticated;
create index tasks_import_owner on public.tasks(user_id,created_at desc) where input->>'operation'='import_profile';

create function public.rf_enqueue_import(p_user uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t uuid:=(p_input->>'taskId')::uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_input->>'operation' is distinct from 'import_profile' or coalesce(length(p_input->>'rawText'),0) not between 40 and 60000 then raise exception 'IMPORT_INVALID';end if;
 if exists(select 1 from tasks where user_id=p_user and input->>'operation'='import_profile' and state in ('queued','running')) then raise exception 'IMPORT_PENDING';end if;
 if (select count(*) from tasks where user_id=p_user and input->>'operation'='import_profile' and created_at>now()-interval '1 hour')>=3 or
    (select count(*) from tasks where user_id=p_user and input->>'operation'='import_profile' and created_at>now()-interval '1 day')>=10 then raise exception 'IMPORT_LIMIT';end if;
 -- Existing tasks insert trigger also enforces shared queue/hour/day/account bounds.
 insert into tasks(id,user_id,input) values(t,p_user,p_input);
 insert into task_events(user_id,task_id,stage) values(p_user,t,'Queued');return t;
end $$;

create function public.rf_claim_capable(p_device uuid,p_imports boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d agent_devices;t tasks;begin
 select * into d from agent_devices where id=p_device and revoked_at is null for update;
 if not found then raise exception 'DEVICE_REVOKED';end if;
 update agent_devices set last_seen=now() where id=d.id;
 if exists(select 1 from tasks where device_id=d.id and state='running' and lease_until>now()) then return null;end if;
 update tasks set state='failed',stage='Failed',error_code='LEASE_EXHAUSTED' where user_id=d.user_id and state='running' and lease_until<=now() and attempts>=3;
 select * into t from tasks where user_id=d.user_id and attempts<3
   and (p_imports or input->>'operation'<>'import_profile')
   and (state='queued' or (state='running' and lease_until<=now())) order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update tasks set state='running',stage=case when input->>'operation'='import_profile' then 'Parsing master resume' else 'Analyzing requirements' end,
   device_id=d.id,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,error_code=null where id=t.id returning * into t;
 insert into task_events(user_id,task_id,stage) values(t.user_id,t.id,t.stage);
 return jsonb_build_object('id',t.id,'input',t.input,'leaseToken',t.lease_token);
end $$;
-- Old companions and old RPC callers never claim an operation they do not support.
create or replace function public.rf_claim(p_device uuid) returns jsonb
language sql security definer set search_path=public as $$ select rf_claim_capable(p_device,false) $$;

create function public.rf_finish_import(p_device uuid,p_task uuid,p_lease uuid,p_output jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t tasks;owner_id uuid;begin
 select user_id into owner_id from tasks where id=p_task and device_id=p_device;
 if not found then raise exception 'LEASE_LOST';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 perform 1 from agent_devices where id=p_device and revoked_at is null for update;
 if not found then raise exception 'DEVICE_REVOKED';end if;
 select * into t from tasks where id=p_task and device_id=p_device and lease_token=p_lease and input->>'operation'='import_profile' for update;
 if not found then raise exception 'LEASE_LOST';end if;
 if t.state='completed' then return t.id;end if;
 if t.state<>'running' or t.lease_until<=now() then raise exception 'LEASE_LOST';end if;
 if pg_column_size(p_output)>750000 or rf_account_bytes(t.user_id)+pg_column_size(p_output)>20971520 then raise exception 'ACCOUNT_LIMIT';end if;
 update tasks set state='completed',stage='Ready for review',completed_at=now(),lease_until=null,draft=p_output where id=t.id;
 insert into task_events(user_id,task_id,stage) values(t.user_id,t.id,'Ready for review');return t.id;
end $$;

create function public.rf_apply_import(p_user uuid,p_task uuid,p_records jsonb,p_contact jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t tasks;p jsonb;r jsonb;existing jsonb;key text;count_added integer:=0;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into t from tasks where id=p_task and user_id=p_user and input->>'operation'='import_profile' for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if t.state<>'completed' then raise exception 'IMPORT_NOT_READY';end if;
 select data into p from profiles where user_id=p_user;
 if t.import_applied_at is not null then return jsonb_build_object('profile',p,'added',0,'alreadyApplied',true);end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>100 then raise exception 'IMPORT_INVALID';end if;
 if p is null then raise exception 'IMPORT_SAVE_PROFILE';end if;
 existing:=p->'records';
 for r in select * from jsonb_array_elements(p_records) loop
   -- A proposed record can never enter the approved fact set through this RPC.
   r:=r||'{"verification":"draft"}'::jsonb;
   key:=lower(btrim(regexp_replace(regexp_replace(concat_ws('|',r->>'kind',r->>'title',r->>'organization',r->>'startDate',r->>'endDate'),'\s+',' ','g'),'\s*\|\s*','|','g')));
   if not exists(select 1 from jsonb_array_elements(existing) e where lower(btrim(regexp_replace(regexp_replace(concat_ws('|',e->>'kind',e->>'title',e->>'organization',e->>'startDate',e->>'endDate'),'\s+',' ','g'),'\s*\|\s*','|','g')))=key) then
     existing:=existing||jsonb_build_array(r);count_added:=count_added+1;
   end if;
 end loop;
 if jsonb_array_length(existing)>150 then raise exception 'ACCOUNT_LIMIT';end if;
 p:=jsonb_set(p,'{records}',existing);
 if p_contact is not null then p:=jsonb_set(p,'{contact}',(p->'contact')||p_contact);end if;
 perform rf_save_profile(p_user,p);
 update tasks set import_applied_at=now() where id=t.id;
 return jsonb_build_object('profile',p,'added',count_added,'alreadyApplied',false);
end $$;

revoke all on function public.rf_enqueue_import(uuid,jsonb),public.rf_claim_capable(uuid,boolean),
 public.rf_finish_import(uuid,uuid,uuid,jsonb),public.rf_apply_import(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.rf_enqueue_import(uuid,jsonb),public.rf_claim_capable(uuid,boolean),
 public.rf_finish_import(uuid,uuid,uuid,jsonb),public.rf_apply_import(uuid,uuid,jsonb,jsonb) to service_role;
