-- Apply after 001 and 002. Service-only RPCs; no browser write privileges.
drop function public.save_workspace_state(uuid,bigint,jsonb);
create function public.save_workspace_state(p_workspace uuid,p_revision bigint,p_document jsonb,p_actor uuid default null,p_role text default null,p_disconnect text default null) returns boolean language plpgsql security invoker set search_path=public as $$
declare changed integer;
begin
 perform 1 from workspace_state where workspace_id=p_workspace for update;
 if p_actor is not null then
   perform 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role=p_role for share;
   if not found then raise exception 'Membership changed. Sign in and retry.' using errcode='42501'; end if;
 end if;
 update workspace_state set document=p_document,revision=revision+1,updated_at=now() where workspace_id=p_workspace and revision=p_revision;
 get diagnostics changed=row_count;
 if changed=1 and p_disconnect is not null then
   if p_role is distinct from 'admin' or p_actor is null then raise exception 'Admin required' using errcode='42501'; end if;
   delete from social_secrets where workspace_id=p_workspace and platform=p_disconnect;
 end if;
 return changed=1;
end;$$;
revoke all on function public.save_workspace_state(uuid,bigint,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_workspace_state(uuid,bigint,jsonb,uuid,text,text) to service_role;

create function public.connect_workspace(p_workspace uuid,p_actor uuid,p_connections jsonb,p_secrets jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare doc jsonb; pubs jsonb; entry jsonb; old_account text; new_account text;
begin
 select document into doc from workspace_state where workspace_id=p_workspace for update;
 perform 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='admin' for share;
 if not found then raise exception 'Admin membership required' using errcode='42501'; end if;
 if doc is null then raise exception 'Workspace missing'; end if;
 if exists(select 1 from jsonb_array_elements(doc->'publications') p where p->>'status'='dispatching') then raise exception 'Publishing in progress. Reconnect later.' using errcode='40001'; end if;
 if jsonb_array_length(p_connections)<>2 or jsonb_array_length(p_secrets)<>2 then raise exception 'Two platform connections required'; end if;
 pubs='[]'::jsonb;
 for entry in select value from jsonb_array_elements(doc->'publications') loop
   select c->>'accountId' into old_account from jsonb_array_elements(doc->'connections') c where c->>'platform'=entry->>'platform';
   select c->>'accountId' into new_account from jsonb_array_elements(p_connections) c where c->>'platform'=entry->>'platform';
   if entry->>'accountId' is null and old_account is not null then entry=jsonb_set(entry,'{accountId}',to_jsonb(old_account)); end if;
   if entry->>'status'='scheduled' and (entry->>'accountId') is distinct from new_account then
     entry=entry||'{"status":"cancelled","error":"Connected account changed. Review before scheduling again."}'::jsonb;
   end if;
   pubs=pubs||jsonb_build_array(entry);
 end loop;
 doc=jsonb_set(jsonb_set(doc,'{publications}',pubs),'{connections}',p_connections);
 doc=jsonb_set(doc,'{audit}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actor',p_actor,'action','meta_connected','at',now()))||coalesce(doc->'audit','[]'::jsonb));
 delete from social_secrets where workspace_id=p_workspace;
 insert into social_secrets(workspace_id,platform,ciphertext) select p_workspace,x->>'platform',x->>'ciphertext' from jsonb_array_elements(p_secrets) x;
 update workspace_state set document=doc,revision=revision+1,updated_at=now() where workspace_id=p_workspace;
end;$$;
revoke all on function public.connect_workspace(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.connect_workspace(uuid,uuid,jsonb,jsonb) to service_role;

create function public.change_workspace_member(p_workspace uuid,p_actor uuid,p_target uuid,p_role text default null) returns void language plpgsql security invoker set search_path=public as $$
begin
 -- Workspace lock serializes administrator changes, preventing cross-demotion of the last admins.
 perform 1 from workspace_state where workspace_id=p_workspace for update;
 perform 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='admin' for share;
 if not found then raise exception 'Admin required' using errcode='42501'; end if;
 if p_actor=p_target then raise exception 'Cannot change own membership'; end if;
 if p_role is null then delete from memberships where workspace_id=p_workspace and user_id=p_target;
 else update memberships set role=p_role where workspace_id=p_workspace and user_id=p_target; end if;
 if not found then raise exception 'Member not found'; end if;
 update workspace_state set revision=revision+1,document=jsonb_set(document,'{audit}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actor',p_actor,'action','team_membership_changed','at',now(),'target',p_target))||coalesce(document->'audit','[]'::jsonb)),updated_at=now() where workspace_id=p_workspace;
end;$$;
revoke all on function public.change_workspace_member(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.change_workspace_member(uuid,uuid,uuid,text) to service_role;

create function public.add_workspace_member(p_workspace uuid,p_actor uuid,p_target uuid,p_email text,p_role text) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from workspace_state where workspace_id=p_workspace for update;
 perform 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='admin' for share;
 if not found then raise exception 'Admin required' using errcode='42501'; end if;
 insert into memberships(workspace_id,user_id,email,role) values(p_workspace,p_target,lower(p_email),p_role);
 update workspace_state set revision=revision+1,document=jsonb_set(document,'{audit}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actor',p_actor,'action','team_invited','at',now(),'target',p_target))||coalesce(document->'audit','[]'::jsonb)),updated_at=now() where workspace_id=p_workspace;
end;$$;
revoke all on function public.add_workspace_member(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.add_workspace_member(uuid,uuid,uuid,text,text) to service_role;
