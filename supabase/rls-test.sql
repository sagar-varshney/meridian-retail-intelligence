-- Integration verification only: all test identities and rows are rolled back.
begin;
select set_config('meridian.test.manager',gen_random_uuid()::text,true),set_config('meridian.test.analyst',gen_random_uuid()::text,true),set_config('meridian.test.outsider',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 (current_setting('meridian.test.manager')::uuid,'manager@meridian-test.invalid',now(),'{}'),
 (current_setting('meridian.test.analyst')::uuid,'analyst@meridian-test.invalid',now(),'{}'),
 (current_setting('meridian.test.outsider')::uuid,'outsider@meridian-test.invalid',now(),'{}');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('meridian.test.manager'),'email','manager@meridian-test.invalid','role','authenticated')::text,true);
select public.meridian_bootstrap();
select set_config('meridian.test.workspace',(select workspace_id::text from public.meridian_members where user_id=auth.uid()),true);
insert into public.meridian_actions(workspace_id,dataset_id,title) values(current_setting('meridian.test.workspace')::uuid,'uci-retail-ii','RLS test action');
insert into public.meridian_saved_views(workspace_id,user_id,name,config) values(current_setting('meridian.test.workspace')::uuid,auth.uid(),'Private view','{}');
insert into public.meridian_members(workspace_id,email,name,role) values(current_setting('meridian.test.workspace')::uuid,'analyst@meridian-test.invalid','Test analyst','analyst');
do $$begin if (select count(*) from public.meridian_events)<>1 then raise exception 'Action audit was not atomic'; end if; end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('meridian.test.analyst'),'email','analyst@meridian-test.invalid','role','authenticated')::text,true);
select public.meridian_bootstrap();
do $$begin
 if meridian_private.member_role(current_setting('meridian.test.workspace')::uuid)<>'analyst' then raise exception 'Invite role was not preserved'; end if;
 if (select count(*) from public.meridian_actions)<>1 then raise exception 'Analyst cannot read shared actions'; end if;
 if (select count(*) from public.meridian_saved_views)<>0 then raise exception 'Another user can read private views'; end if;
 begin
  insert into public.meridian_datasets(workspace_id,name,object_key,rows,created_by) values(current_setting('meridian.test.workspace')::uuid,'Forbidden','x',1,auth.uid());
  raise exception 'Analyst import unexpectedly allowed';
 exception when insufficient_privilege then null;end;
end$$;
update public.meridian_actions set status='In progress' where title='RLS test action';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('meridian.test.outsider'),'email','outsider@meridian-test.invalid','role','authenticated')::text,true);
select public.meridian_bootstrap();
do $$begin
 if (select count(*) from public.meridian_actions)<>0 then raise exception 'Workspace action leak'; end if;
 if (select count(*) from public.meridian_events)<>0 then raise exception 'Workspace event leak'; end if;
 if meridian_private.member_role(current_setting('meridian.test.workspace')::uuid) is not null then raise exception 'Outsider role leak'; end if;
end$$;
select 'PASS: confirmed-email invitations, analyst restrictions, private views, workspace isolation and audit triggers' as verification;
rollback;
