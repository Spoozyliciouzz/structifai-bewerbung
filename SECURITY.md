# Security Posture

Dieses Repo ist öffentlich und wird mit dem Empfänger geteilt. Annahme: ein Angreifer liest
den kompletten Code — Endpoint, Anon-Key, Tabellen, Flow. Das System darf dadurch **nicht**
manipulierbar werden. Diese Datei beschreibt die tatsächlich gebauten Kontrollen (kein
Security-Theater). Sie wird bei Abweichung korrigiert.

## Trust-Boundary
Alles, was via Tool gefetcht oder eingegeben wird — Enrich-HTML, gescrapter Job-Text, Email,
Sprachassistent-Transkript — ist **untrusted DATEN**. Niemals Instruktion, niemals Code.

## Kontrollen

| Bedrohung | Kontrolle |
|---|---|
| Stored-XSS in generierter Seite/Mail | Text-only-Templates, jeder interpolierte Wert HTML-escaped; CSP `default-src 'self'; script-src 'none'` auf ausgelieferte Seiten |
| Prompt-Injection (Enrich/Job-Text) | Untrusted-Content im Prompt per Delimiter abgegrenzt + System-Instruktion „nur Daten"; Output bleibt untrusted → Escaping ist die harte Grenze |
| PII-Leak | `build_jobs` enthält keine PII; `build_jobs_pii` hat keine anon-Policy (deny-by-default); PII-Löschung <24h |
| RLS-Bypass | Service-Role-Key nur in Function-Secrets, nie Client/Repo |
| Storage-Manipulation | `sites`/`cache` nur Service-Role schreibbar; `cache` privat (kein public read) |
| Endpoint-Missbrauch (Mail-Spam) | Server-Token/Proof-of-Work + Rate-Limit (IP/Domain) + eine Bewerbung pro Email; CORS auf structifai.de |
| Voice-Missbrauch | Widget nur auf `/b/*`, ein Assistent je Bewerbung, Prompt nur aus dem Generator; kein REST-Zugriff auf Famulor möglich (Plan ohne API) |
| Secret-Leak via Git | `.gitignore` für `.env*`, `scraper/.auth/`, `cache/`; nur `.env.example` committed; History secret-frei |
| Repo-Integrität | Branch-Protection auf `main`, keine Collaborators, Secret-Scanning + Push-Protection |

## Disclosure
Sicherheitslücken bitte vertraulich an **d.benter@djwcapitalmanagement.de**.

## Out of Scope
Kein Login/Account, kein Multi-User. Der Sprachassistent läuft als Widget, von der Besucherin
selbst gestartet — kein Anruf, kein Consent-Gate nötig. Kein Tracking.
