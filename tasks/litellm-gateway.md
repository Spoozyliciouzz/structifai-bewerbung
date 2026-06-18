# Plan — LiteLLM-Gateway (geparkt, nach Voice-Agent)

Zentraler LLM-Router für **alle DJW-Projekte** auf Dennis' **netcup-VPS**. Status: **geparkt** —
erst Voice-Agent fertig (Strang A). Eigener Infra-Build, nicht im Voice-Scope.

## Ziel
Ein Endpoint (OpenAI-Format) vor Anthropic + Google/Gemini. Pro Function/Task günstigstes Modell,
ein Key nach außen, zentrales Kosten-Dashboard, Spend-Caps + Alerts, Fallback. Functions im Code
schon vorbereitet (LiteLLM primär, `api.anthropic.com` Fallback) → Umstellung nur via Env.

## Grobe Schritte
- [ ] netcup: Docker + `ghcr.io/berriai/litellm`, `config.yaml` (Provider-Keys Anthropic+Google, Modell-Aliase)
- [ ] Postgres für Spend-Tracking/Virtual-Keys (lokal im Compose oder Supabase)
- [ ] Reverse-Proxy (Caddy/nginx) + Subdomain `llm.djwcapitalmanagement.de` + TLS
- [ ] Master-Key + Virtual-Keys pro Projekt; Budget-Caps + Alerts
- [ ] Env umstellen: `LLM_API_KEY` = LiteLLM-Key, `LITELLM_BASE_URL` = Subdomain → redeploy (kein Code)
- [ ] Smoke-Test je Projekt; Anthropic-Direkt-Fallback verifizieren

## Betroffene Repos (Env-Umstellung)
structifai-bewerbung (build, relay/voice), + weitere DJW-Functions mit Anthropic/Google-Calls.
