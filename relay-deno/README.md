# relay-deno — Voice-Relay auf Deno Deploy

Das ConversationRelay-WebSocket-Herzstück als eigenständiger **Deno-Deploy**-Service.

**Warum hier statt Supabase:** Supabase Edge Functions kappen lang laufende WebSockets bei
~75 s (Close-Code 1006, reproduziert) → der Anruf brach mitten im Satz ab. Deno Deploy hat kein
solches Limit. Die Reasoning-/Gesprächs-Logik liegt **self-contained in `./lib/`** (Kopie aus
`pipeline/`; `tests/conversation.test.ts` prüft diese Live-Kopie) — kein Import außerhalb von
`relay-deno/`, damit der Ordner als eigenes Deploy-Verzeichnis funktioniert.

`build`, Mail, Landing, Galerie bleiben auf Supabase. Nur der Relay zieht um.

## Deploy (Deno Deploy)

1. **dash.deno.com** → mit GitHub einloggen → **New App** → Repo **`Spoozyliciouzz/structifai-bewerbung`**.
2. Konfig:
   - **App directory / root:** `relay-deno`  ← self-contained, alle Imports lokal
   - **Entry point:** `main.ts`
   - **Production branch:** `main` · Install-/Build-Command **leer** (Deno braucht keinen Build).
   - *Alternativ ohne Dashboard-Picker (CLI):* `deno install -gArf jsr:@deno/deployctl` dann aus
     dem Repo-Root `deployctl deploy --entrypoint=relay-deno/main.ts` (deployt das ganze Repo,
     `relay-deno/main.ts` als Einstieg).
3. **Environment Variables** setzen (Project → Settings → Environment Variables):

   | Variable | Wert | Pflicht |
   |---|---|---|
   | `LLM_API_KEY` | dein Anthropic-API-Key (aus `.env` / Anthropic-Console) | **ja** |
   | `LLM_MODEL_VOICE` | `claude-haiku-4-5-20251001` | empfohlen |
   | `SUPABASE_URL` | `https://qpxoggvbkbjluxkorgrp.supabase.co` | für Transkript-Log |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service-Role-Key (Supabase → Settings → API) | für Transkript-Log |
   | `LITELLM_BASE_URL` | *(leer lassen)* | nein |

   Ohne die `SUPABASE_*`-Vars läuft der Anruf trotzdem (Kontext kommt dann aus dem gebündelten
   `context-fallback.json`, nur die Transkript-Persistenz entfällt).

4. **Deploy** → du bekommst eine URL wie `https://structifai-relay-xxxx.deno.dev`.
   - **Health-Check:** die URL im Browser öffnen → „relay up …" = läuft.

## Danach (in diesem Repo / Supabase)

5. `RELAY_WSS_URL` auf den neuen Host setzen (Deno gibt `https://…`, wir brauchen `wss://…/`):
   ```
   supabase secrets set RELAY_WSS_URL=wss://structifai-relay-xxxx.deno.dev/ --project-ref qpxoggvbkbjluxkorgrp
   ```
6. `outbound-trigger` neu deployen (liest `RELAY_WSS_URL` für die TwiML):
   ```
   supabase functions deploy outbound-trigger --workdir pipeline --use-api --no-verify-jwt
   ```
7. Testanruf → läuft jetzt voll durch (kein 75 s-Cut).

## Lokal testen
```
cd relay-deno
deno task dev            # startet auf http://localhost:8000
```
`http://localhost:8000/` im Browser → Health-Check. WS-Upgrade an `ws://localhost:8000/`.
