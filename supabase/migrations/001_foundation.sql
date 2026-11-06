-- Execute as a Supabase database administrator. API clients have read-only RLS access.
create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null);
create table public.memberships(workspace_id uuid references public.workspaces on delete cascade,user_id uuid references auth.users on delete cascade,email text not null,role text not null check(role in ('admin','creator','approver')),primary key(workspace_id,user_id));
create table public.workspace_state(workspace_id uuid primary key references public.workspaces on delete cascade,revision bigint not null default 0,document jsonb not null,updated_at timestamptz not null default now());
create table public.assets(id uuid primary key,workspace_id uuid references public.workspaces on delete cascade,path text not null unique,width integer not null,height integer not null,bytes integer not null,mime text not null check(mime='image/jpeg'));
create table public.social_secrets(workspace_id uuid references public.workspaces on delete cascade,platform text check(platform in ('facebook','instagram')),ciphertext text not null,primary key(workspace_id,platform));
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.workspace_state enable row level security;
alter table public.assets enable row level security;
alter table public.social_secrets enable row level security;
create policy own_membership on public.memberships for select to authenticated using(user_id=auth.uid());
create policy workspace_read on public.workspaces for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=id and m.user_id=auth.uid()));
create policy state_read on public.workspace_state for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=workspace_state.workspace_id and m.user_id=auth.uid()));
create policy asset_read on public.assets for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=assets.workspace_id and m.user_id=auth.uid()));
-- No client write policies; no client access at all to encrypted credentials.
revoke all on public.social_secrets from anon,authenticated;
revoke all on public.workspace_state,public.memberships,public.assets,public.workspaces from anon,authenticated;
grant select on public.workspace_state,public.memberships,public.assets,public.workspaces to authenticated;
grant all on public.workspace_state,public.memberships,public.assets,public.workspaces,public.social_secrets to service_role;
create or replace function public.save_workspace_state(p_workspace uuid,p_revision bigint,p_document jsonb) returns boolean language plpgsql security invoker set search_path=public as $$
declare changed integer;
begin
 update public.workspace_state set document=p_document,revision=revision+1,updated_at=now() where workspace_id=p_workspace and revision=p_revision;
 get diagnostics changed=row_count;
 return changed=1;
end;$$;
revoke all on function public.save_workspace_state(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_workspace_state(uuid,bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('marketing-images','marketing-images',false,8388608,array['image/jpeg']) on conflict(id) do nothing;
-- Private bucket. Images are signed server-side after membership authorization.
