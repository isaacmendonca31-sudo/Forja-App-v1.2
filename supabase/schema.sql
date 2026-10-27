-- =============================================================================
-- FORJA — Esquema Supabase (PostgreSQL) com isolamento por usuário (RLS)
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo → Run.
-- Pode ser executado mais de uma vez (idempotente).
--
-- Modelo: uma tabela genérica de "registros" (plan, settings, exercise, session).
-- Cada linha pertence a UM usuário (user_id = auth.uid()) e só ele a enxerga.
-- =============================================================================

create table if not exists public.forja_records (
  -- Dono do registro. O valor padrão vem do token do usuário autenticado:
  -- o cliente não precisa (nem consegue, por causa do RLS) escolher outro dono.
  user_id           uuid        not null default auth.uid()
                                references auth.users (id) on delete cascade,
  kind              text        not null check (kind in ('plan', 'settings', 'exercise', 'session')),
  id                text        not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data              jsonb       not null check (jsonb_typeof(data) = 'object'
                                                and pg_column_size(data) < 200000), -- limite ~200 KB/registro
  client_updated_at bigint      not null check (client_updated_at >= 0), -- ms; usado no "last write wins"
  deleted           boolean     not null default false,                  -- lápide de exclusão
  updated_at        timestamptz not null default now(),                  -- relógio do SERVIDOR (cursor de pull)
  primary key (user_id, kind, id)
);

-- Índice para o "pull" incremental (registros alterados desde o último cursor).
create index if not exists forja_records_pull_idx
  on public.forja_records (user_id, updated_at);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só acessa as próprias linhas.
-- FORCE garante que nem o dono da tabela contorne as políticas por engano.
-- ----------------------------------------------------------------------------
alter table public.forja_records enable row level security;
alter table public.forja_records force  row level security;

drop policy if exists forja_select_own on public.forja_records;
drop policy if exists forja_insert_own on public.forja_records;
drop policy if exists forja_update_own on public.forja_records;
drop policy if exists forja_delete_own on public.forja_records;

-- (select auth.uid()) é avaliado uma vez por consulta (mais eficiente que auth.uid() direto).
create policy forja_select_own on public.forja_records
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy forja_insert_own on public.forja_records
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy forja_update_own on public.forja_records
  for update to authenticated
  using      ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy forja_delete_own on public.forja_records
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Privilégios mínimos: o papel anônimo (visitante sem login) não acessa nada.
revoke all on public.forja_records from anon;
revoke all on public.forja_records from public;
grant select, insert, update, delete on public.forja_records to authenticated;

-- ----------------------------------------------------------------------------
-- Resolução de conflitos no servidor ("last write wins"):
--  • Impede trocar o dono de uma linha.
--  • Ignora silenciosamente uma gravação MAIS ANTIGA que a já existente
--    (ex.: celular que ficou offline por dias não sobrescreve dados novos).
--  • Atualiza updated_at com o relógio do servidor.
-- ----------------------------------------------------------------------------
create or replace function public.forja_records_lww()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id é imutável';
  end if;

  if new.client_updated_at < old.client_updated_at then
    return null; -- em BEFORE ROW, retornar NULL descarta esta atualização
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forja_records_lww on public.forja_records;
create trigger forja_records_lww
  before update on public.forja_records
  for each row execute function public.forja_records_lww();

-- =============================================================================
-- Checklist no painel do Supabase (Authentication):
--   1. Providers → Email: DESATIVE "Allow new users to sign up"
--      (o app tem só 2 usuários; crie-os manualmente em Authentication → Users).
--   2. Ative "Confirm email" e defina senha mínima forte (≥ 10 caracteres).
--   3. (Opcional) Ative MFA/TOTP para as duas contas.
--   4. URL Configuration: informe a URL real do app (Site URL).
--   5. Nunca exponha a chave "service_role" no app.
-- =============================================================================
