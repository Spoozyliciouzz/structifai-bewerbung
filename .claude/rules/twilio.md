# Rules — Twilio (Outbound-only)

Eine Twilio-Nummer, **nur Outbound** (aktuell US-Toll-Free `+1 833…`). Voice-fähig.

- **Outbound:** Agent ruft den Empfänger von dieser Nummer via REST `Calls` an (inline `Twiml`-Param).
  TwiML = `<Connect><ConversationRelay …>` (kein eigener Audio-Layer — STT/TTS macht ConversationRelay).
- **KEIN Inbound/Rückruf auf die Twilio-Nummer.** Konzept (verbindlich): der Anruf ist **angekündigt**,
  Empfänger nimmt ab. Am Ende verweist der Assistent auf die **Nummer in der gerade zugestellten Mail**
  = Dennis' Handy (`DENNIS_PHONE`). Empfänger ruft dort direkt an → klingelt bei Dennis. Twilio ist nicht
  im Rückruf-Pfad ⇒ Toll-Free als reine Outbound-Caller-ID ist unkritisch (niemand ruft sie zurück).
  Kein `inbound`-Webhook, keine Flüsteransage, keine `<Dial>`-Bridge mehr.
- **Mail-Integration:** `build/`-Mail MUSS `DENNIS_PHONE` als Rückruf-Nr enthalten (sonst kennt der
  Empfänger sie nicht). Closing des Voice-Agenten verweist genau darauf.
- **Secrets:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`, `DENNIS_PHONE` nur als
  Function-Secrets. Dennis' Handynummer ist Secret, nie Repo/Client.
- **Vor Custom-Code:** Twilio TS-SDK + offizielle ConversationRelay-Docs prüfen. Kein roher
  Media-Streams-Audio-Layer, kein separater STT-Dienst.
- **Kosten-Caps:** Voice + ConversationRelay-Aufschlag + ElevenLabs-Zeichen — harte Limits + Alerts.
  Preise vor Go-live verifizieren (ändern sich), keine fixen Zahlen annehmen.
- **Hinweis Nummernwahl:** Toll-Free reicht für Outbound. Wenn später doch geografische DE-Präsenz
  als Caller-ID gewünscht (Annahmequote bei DE-Empfängern), separate +49-Nummer kaufen — Code ist
  env-driven (`TWILIO_NUMBER`), kein Code-Change.
