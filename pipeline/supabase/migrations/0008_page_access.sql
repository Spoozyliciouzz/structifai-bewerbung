-- 0008 · Zugang zum Stellenteil per Code (Ankunftsseite).
-- page_slug: nicht erratbare Adresse /b/<slug> (16 Zufallsbytes base64url).
-- access_code: normalisierter Code aus dem Anschreiben (z. B. LM7Q4K), nur serverseitig geprüft.
-- RLS bleibt: an, keine Policy ⇒ nur Service-Role (bw-open, bw-page).
alter table public.bw_applications
  add column if not exists page_slug   text,
  add column if not exists access_code text;

alter table public.bw_applications
  add constraint bw_applications_page_slug_fmt  check (page_slug is null or page_slug ~ '^[A-Za-z0-9_-]{22}$'),
  add constraint bw_applications_access_code_fmt check (access_code is null or access_code ~ '^[A-Z0-9]{3,16}$');

create unique index if not exists bw_applications_page_slug_key   on public.bw_applications (page_slug);
create unique index if not exists bw_applications_access_code_key on public.bw_applications (access_code);
