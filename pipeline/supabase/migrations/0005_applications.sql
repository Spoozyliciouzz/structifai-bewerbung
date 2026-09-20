-- ════════════════════════════════════════════════════════════════════════════
-- 0003_applications.sql — von einer Bewerbung zu vielen
-- Trennt die 80 % stellen-agnostischen Inhalte (profile/dennis.json, voice_agent_context)
-- von den 20 %, die eine Seite zur n=1-Seite für genau eine Firma und eine Stelle machen.
-- RLS-Idiom wie 0001/0002: RLS an, KEINE Policy ⇒ nur Service-Role kommt heran.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Eine Zeile je Stellenanzeige ─────────────────────────────────────────────
-- id ist ein sprechender Slug ('lm-2786630'), kein zufälliges UUID: der Wert reist als
-- <Parameter> durch TwiML in das ConversationRelay-setup und taucht in Logs auf. Der
-- CHECK hält ihn XML-/URL-sicher — er kommt von Twilio zurück und ist dort untrusted.
create table if not exists public.applications (
  id               text primary key,
  company          text not null,
  role_title       text not null,
  job_url          text,
  job_source_id    text,                                -- Anzeigen-ID beim Portal
  enrich_domain    text,                                -- Firmenseite für die Anreicherung
                                                        -- (LM: lm-ag.de, NICHT der Personio-Host)
  status           text not null default 'draft',       -- draft | released | archived
  released_version integer,                             -- zeigt auf application_content.version
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'applications_id_slug_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_id_slug_check
      check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'applications_status_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_status_check
      check (status in ('draft', 'released', 'archived'));
  end if;

  -- Kernzusage: 'released' ohne freigegebene Version darf es nicht geben. Sonst könnte
  -- ein Gespräch als freigegeben gelten und trotzdem keinen Kontext haben.
  if not exists (
    select 1 from pg_constraint
    where conname = 'applications_released_needs_version_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_released_needs_version_check
      check (status <> 'released' or released_version is not null);
  end if;
end $$;

alter table public.applications enable row level security;
-- Keine Policy ⇒ deny-by-default (Idiom aus 0001, vgl. build_jobs_pii).
drop policy if exists no_anon on public.applications;

-- ── Unveränderliche Inhaltsversionen ─────────────────────────────────────────
-- Genau ein Seitenentwurf (page) und genau ein Gesprächskontext (voice) je Version.
-- Seite und Gespräch nutzen damit garantiert denselben freigegebenen Stand.
-- voice enthält NUR die n=1-Buckets (the_role, objections, stellenbezogene faq).
-- Die agnostischen Buckets (profile, projects, stories, personal, pronunciation)
-- bleiben global in voice_agent_context — ebenso der Lieblingseis-Hook, der am
-- Empfänger hängt und nicht an der Stelle.
create table if not exists public.application_content (
  application_id text    not null references public.applications(id) on delete cascade,
  version        integer not null,
  page           jsonb   not null,
  voice          jsonb   not null,
  created_at     timestamptz not null default now(),
  released_at    timestamptz,                           -- null = Entwurf
  primary key (application_id, version)
);
-- Kein separater FK-Index nötig: der Primärschlüssel führt mit application_id und
-- bedient Joins wie ON DELETE CASCADE bereits.

alter table public.application_content enable row level security;
drop policy if exists no_anon on public.application_content;

-- Freigegebene Versionen sind unveränderlich. Ohne das könnte ein Gespräch mitten im
-- Lauf anderen Text bekommen als die Seite, die der Empfänger gerade liest.
create or replace function public.freeze_released_application_content()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.released_at is not null then
    raise exception
      'application_content %/% ist freigegeben und unveraenderlich; neue Version anlegen',
      old.application_id, old.version
      using errcode = 'restrict_violation';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists freeze_released_application_content on public.application_content;
create trigger freeze_released_application_content
  before update or delete on public.application_content
  for each row execute function public.freeze_released_application_content();

-- ── Bestehende Tabellen an die Bewerbung hängen ──────────────────────────────
-- Nullable und ohne FK-Zwang: Altzeilen aus der Einzelbewerbung bleiben gültig.
--
-- BEWUSST NICHT auf public.build_jobs: die Tabelle hat `anon_read using(true)`, also darf
-- jeder alle Zeilen lesen. 0001 begründet das damit, dass dort kein PII steht. Eine
-- application_id wie 'lm-2786630' würde genau diese Begründung brechen — sie verrät, bei
-- welcher Firma und auf welche Anzeige Dennis sich beworben hat, und wäre über die erlaubte
-- Enumeration komplett auslesbar. Die Zuordnung gehört deshalb in die service-role-dichte
-- PII-Tabelle, zusammen mit der 24-Stunden-Löschfrist.
alter table public.build_jobs_pii add column if not exists application_id text;
alter table public.voice_calls    add column if not exists application_id text;

create index if not exists build_jobs_pii_application_idx on public.build_jobs_pii (application_id);
create index if not exists voice_calls_application_idx    on public.voice_calls    (application_id);

-- ── updated_at pflegen ───────────────────────────────────────────────────────
-- search_path fest verdrahtet: sonst könnte ein abweichender Suchpfad `now()` auf eine
-- untergeschobene Funktion umlenken (Hausregel aus 0001/0002 für alle eigenen Funktionen).
create or replace function public.touch_applications_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_applications_updated_at on public.applications;
create trigger touch_applications_updated_at
  before update on public.applications
  for each row execute function public.touch_applications_updated_at();
