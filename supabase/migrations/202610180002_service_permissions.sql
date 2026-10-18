-- Do not depend on the project's default grants for server operations.
grant select,insert,update,delete on public.profiles,public.source_records,public.jobs,
  public.agent_devices,public.pairing_requests,public.profile_snapshots,public.job_snapshots,
  public.tasks,public.task_events,public.resume_versions,public.artifacts,public.applications,
  public.rate_limits to service_role;
grant usage,select on sequence public.task_events_id_seq to service_role;
