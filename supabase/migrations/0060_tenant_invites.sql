-- 0060_tenant_invites.sql
-- Convite de equipe (aba "Equipe" de Settings.jsx): `tenant_invites` —
-- substitui `base44.users.inviteUser` do original, que dependia da
-- plataforma Base44 para criar a conta e disparar o e-mail. Sem Edge
-- Function/e-mail automático neste projeto, a abordagem virou "lista de
-- espera": um admin registra e-mail+papel aqui; quando essa pessoa se
-- cadastra pelo signup normal, o sistema reconhece o e-mail com convite
-- `pending` e a associa ao tenant certo (criando a linha em `tenant_users`)
-- em vez de deixá-la criar/entrar numa empresa nova. Essa lógica de
-- aceite/associação é toda baseada em função `SECURITY DEFINER` — fora do
-- escopo desta migration, ver nota de RLS no final do arquivo.
--
-- Lacuna que esta tabela resolve: já estava documentada como conhecida e
-- não resolvida em 0002_rls_tenants_and_claim_hook.sql ("o fluxo de
-- aceitar convite precisa de um mecanismo à parte... precisa existir antes
-- de o convite por e-mail ser implementado").
--
-- Normalização de e-mail: em vez de um `check (email = lower(email))` (que
-- só rejeita entrada não normalizada, obrigando o chamador a sempre
-- normalizar antes de mandar), esta migration usa uma trigger
-- `before insert or update` que força `lower(email)` no próprio valor
-- gravado. Decisão: mais resiliente — a tabela nunca fica em estado
-- inconsistente por esquecimento do chamador (frontend ou função de
-- convite), sem depender de disciplina externa.
--
-- SEM soft-delete: revogação de convite já é modelada como
-- `status = 'revoked'`, não precisa de exclusão lógica em cima de um
-- status que já cumpre esse papel.
--
-- RLS: NAO configurada nesta migration. Responsabilidade do subagente
-- `rls-guardian` (próxima etapa) — inclui a função/RPC `security definer`
-- de aceite de convite (que lê `tenant_invites` por e-mail no momento do
-- signup, cria a linha em `tenant_users` e marca o convite como
-- `accepted`), além das policies de select/insert/update restritas a
-- `admin` do tenant certo, com teste de isolamento correspondente.

-- 1. Enum de status do convite.
create type tenant_invite_status as enum (
  'pending',
  'accepted',
  'revoked'
);

-- 2. tenant_invites
create table tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),

  email text not null,
  role tenant_role not null,
  status tenant_invite_status not null default 'pending',

  invited_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

comment on table tenant_invites is
  'Convite de equipe em formato "lista de espera": admin registra '
  'e-mail+papel; quando a pessoa se cadastra pelo signup normal, uma '
  'função security definer (rls-guardian) reconhece o e-mail com convite '
  'pending e a associa ao tenant certo em tenant_users. Substitui '
  'base44.users.inviteUser (que dependia da plataforma Base44 para enviar '
  'e-mail), lacuna já registrada em 0002.';

comment on column tenant_invites.email is
  'Sempre gravado em minúsculo pela trigger normalize_tenant_invites_email '
  '(before insert/update) — não depende do chamador mandar já normalizado.';

comment on column tenant_invites.accepted_at is
  'Preenchido pela função security definer de aceite, junto com '
  'status = accepted. NULL enquanto pending ou revoked.';

-- 3. Trigger de normalização de e-mail (ver decisão no topo do arquivo).
create or replace function normalize_tenant_invites_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(new.email);
  return new;
end;
$$;

create trigger normalize_tenant_invites_email_trg
  before insert or update on tenant_invites
  for each row
  execute function normalize_tenant_invites_email();

-- 4. Índices compostos (tenant_id primeiro, padrão do projeto).

-- Índice único parcial: no máximo 1 convite pending por e-mail, por
-- tenant — evita duplicar convite para a mesma pessoa enquanto o convite
-- anterior ainda não foi aceito/revogado.
create unique index tenant_invites_tenant_id_email_pending_uidx
  on tenant_invites (tenant_id, email)
  where status = 'pending';

-- Listagem de convites pendentes (tela de Equipe em Settings.jsx).
create index tenant_invites_tenant_id_status_idx
  on tenant_invites (tenant_id, status);

-- ---------------------------------------------------------------------
-- Grants explicitos. Mesmo padrao de 0007/0008/0024/0030/0042: nao
-- confiar no default privilege do schema, conceder select/insert/update
-- explicitamente a `authenticated`, nada a `anon`. Sem delete: revogar um
-- convite e um UPDATE de status, nao uma remocao de linha.
-- ---------------------------------------------------------------------
grant select, insert, update on public.tenant_invites to authenticated;

-- ---------------------------------------------------------------------
-- RLS PENDENTE: `tenant_invites` ainda NAO tem Row Level Security
-- habilitada. Responsabilidade do subagente `rls-guardian` na proxima
-- etapa, com teste de isolamento correspondente, antes de qualquer dado
-- real trafegar por esta tabela. Inclui a função/RPC security definer de
-- aceite de convite no signup (ela precisa ler tenant_invites por e-mail
-- ANTES de o usuário ter claim de tenant_id no JWT — mesmo tipo de
-- exceção já registrada para public_leads em 0057) e as policies de
-- select/insert/update restritas a admin do tenant certo via claim.
-- ---------------------------------------------------------------------
