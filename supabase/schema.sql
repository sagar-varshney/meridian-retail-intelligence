-- Meridian schema: apply once to its dedicated Supabase project.
create schema if not exists meridian_private;
revoke all on schema meridian_private from public, anon;
grant usage on schema meridian_private to authenticated;

create table public.meridian_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null default 'My retail workspace',
 owner_id uuid not null unique references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create table public.meridian_members (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.meridian_workspaces(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, email text not null check(email=lower(email)), name text not null,
 role text not null check(role in ('manager','analyst')), unique(workspace_id,email), unique(workspace_id,user_id)
);
create index meridian_members_user on public.meridian_members(user_id);
create table public.meridian_datasets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.meridian_workspaces(id) on delete cascade,
 name text not null, object_key text not null, rows integer not null check(rows between 0 and 20000),
 status text not null default 'ready' check(status in ('ready','archived')),
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id)
);
create index meridian_datasets_workspace on public.meridian_datasets(workspace_id);
create table public.meridian_actions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.meridian_workspaces(id) on delete cascade,
 dataset_id text not null, title text not null check(length(title) between 1 and 160), description text not null default '',
 evidence text not null default '', owner text not null default 'Unassigned', priority text not null default 'Medium' check(priority in ('High','Medium','Low')),
 status text not null default 'To do' check(status in ('To do','In progress','Done')), due_date text not null default '',
 outcome text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index meridian_actions_workspace on public.meridian_actions(workspace_id);
create table public.meridian_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.meridian_workspaces(id) on delete cascade,
 action_id uuid not null references public.meridian_actions(id) on delete cascade, actor_id uuid not null references auth.users(id),
 actor text not null, text text not null check(length(text) between 1 and 2000), created_at timestamptz not null default now()
);
create index meridian_events_action on public.meridian_events(action_id);
create table public.meridian_saved_views (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.meridian_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, name text not null, config jsonb not null,
 created_at timestamptz not null default now()
);

-- A narrowly scoped definer lookup avoids recursive membership RLS. It returns
-- only the caller's own role and is kept out of the exposed public schema.
create function meridian_private.member_role(wid uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from public.meridian_members m where auth.uid() is not null and m.workspace_id=wid and m.user_id=auth.uid() limit 1
$$;
revoke all on function meridian_private.member_role(uuid) from public,anon;
grant execute on function meridian_private.member_role(uuid) to authenticated;

create function meridian_private.bootstrap() returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); verified_email text; display_name text; wid uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select lower(email), coalesce(nullif(raw_user_meta_data->>'display_name',''),email) into verified_email,display_name
 from auth.users where id=uid and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Confirm your email before opening a workspace'; end if;
 update public.meridian_members set user_id=uid,name=display_name where email=verified_email and user_id is null;
 if not exists(select 1 from public.meridian_members where user_id=uid) then
  insert into public.meridian_workspaces(owner_id) values(uid) on conflict(owner_id) do nothing;
  select id into wid from public.meridian_workspaces where owner_id=uid;
  insert into public.meridian_members(workspace_id,user_id,email,name,role) values(wid,uid,verified_email,display_name,'manager') on conflict(workspace_id,email) do nothing;
 end if;
end $$;
revoke all on function meridian_private.bootstrap() from public,anon;
grant execute on function meridian_private.bootstrap() to authenticated;
create function public.meridian_bootstrap() returns void language sql security invoker set search_path='' as $$select meridian_private.bootstrap()$$;
revoke all on function public.meridian_bootstrap() from public,anon;
grant execute on function public.meridian_bootstrap() to authenticated;

alter table public.meridian_workspaces enable row level security;
alter table public.meridian_members enable row level security;
alter table public.meridian_datasets enable row level security;
alter table public.meridian_actions enable row level security;
alter table public.meridian_events enable row level security;
alter table public.meridian_saved_views enable row level security;
grant select on public.meridian_workspaces to authenticated;
grant select,insert on public.meridian_members to authenticated;
grant select,insert,update,delete on public.meridian_datasets,public.meridian_actions to authenticated;
grant select,insert on public.meridian_events to authenticated;
grant select,insert,delete on public.meridian_saved_views to authenticated;
revoke all on public.meridian_workspaces,public.meridian_members,public.meridian_datasets,public.meridian_actions,public.meridian_events,public.meridian_saved_views from anon;
create policy workspace_read on public.meridian_workspaces for select to authenticated using(meridian_private.member_role(id) is not null);
create policy members_read on public.meridian_members for select to authenticated using(meridian_private.member_role(workspace_id) is not null);
create policy members_invite on public.meridian_members for insert to authenticated with check(meridian_private.member_role(workspace_id)='manager' and user_id is null);
create policy dataset_read on public.meridian_datasets for select to authenticated using(meridian_private.member_role(workspace_id) is not null);
create policy dataset_insert on public.meridian_datasets for insert to authenticated with check(meridian_private.member_role(workspace_id)='manager' and created_by=(select auth.uid()));
create policy dataset_update on public.meridian_datasets for update to authenticated using(meridian_private.member_role(workspace_id)='manager') with check(meridian_private.member_role(workspace_id)='manager');
create policy dataset_delete on public.meridian_datasets for delete to authenticated using(meridian_private.member_role(workspace_id)='manager');
create policy action_read on public.meridian_actions for select to authenticated using(meridian_private.member_role(workspace_id) is not null);
create policy action_insert on public.meridian_actions for insert to authenticated with check(meridian_private.member_role(workspace_id) is not null and (dataset_id='uci-retail-ii' or exists(select 1 from public.meridian_datasets d where d.id::text=dataset_id and d.workspace_id=meridian_actions.workspace_id)));
create policy action_update on public.meridian_actions for update to authenticated using(meridian_private.member_role(workspace_id) is not null) with check(meridian_private.member_role(workspace_id) is not null and (dataset_id='uci-retail-ii' or exists(select 1 from public.meridian_datasets d where d.id::text=dataset_id and d.workspace_id=meridian_actions.workspace_id)));
create policy action_delete on public.meridian_actions for delete to authenticated using(meridian_private.member_role(workspace_id)='manager');
create policy event_read on public.meridian_events for select to authenticated using(meridian_private.member_role(workspace_id) is not null);
create policy event_insert on public.meridian_events for insert to authenticated with check(actor_id=(select auth.uid()) and meridian_private.member_role(workspace_id) is not null and exists(select 1 from public.meridian_actions a where a.id=action_id and a.workspace_id=meridian_events.workspace_id));
create policy view_read on public.meridian_saved_views for select to authenticated using(user_id=(select auth.uid()) and meridian_private.member_role(workspace_id) is not null);
create policy view_insert on public.meridian_saved_views for insert to authenticated with check(user_id=(select auth.uid()) and meridian_private.member_role(workspace_id) is not null);
create policy view_delete on public.meridian_saved_views for delete to authenticated using(user_id=(select auth.uid()) and meridian_private.member_role(workspace_id) is not null);

create function meridian_private.audit_action() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.updated_at=now();
 insert into public.meridian_events(workspace_id,action_id,actor_id,actor,text) values(new.workspace_id,new.id,auth.uid(),coalesce(auth.jwt()->'user_metadata'->>'display_name',auth.jwt()->>'email','Member'),case when tg_op='INSERT' then 'Created the action.' else 'Updated the action.' end);
 return new;
end $$;
-- AFTER triggers allow the inserted action to satisfy the event policy/FK.
create trigger meridian_action_history after insert or update on public.meridian_actions for each row execute function meridian_private.audit_action();
revoke all on function meridian_private.audit_action() from public,anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('meridian-uploads','meridian-uploads',false,4000000,array['text/csv','application/json']);
create policy meridian_storage_read on storage.objects for select to authenticated using(bucket_id='meridian-uploads' and meridian_private.member_role(((storage.foldername(name))[1])::uuid) is not null);
create policy meridian_storage_insert on storage.objects for insert to authenticated with check(bucket_id='meridian-uploads' and meridian_private.member_role(((storage.foldername(name))[1])::uuid)='manager');
create policy meridian_storage_delete on storage.objects for delete to authenticated using(bucket_id='meridian-uploads' and meridian_private.member_role(((storage.foldername(name))[1])::uuid)='manager');
