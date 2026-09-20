/**
 * Baut System-Prompt + Begrüßung des Famulor-Assistenten aus Repo-Daten und druckt sie als
 * JSON auf stdout — Eingabe für MCP `update_assistant`. Reine Datei→stdout-Transformation:
 * kein Netz, keine Secrets, kein Schreiben.
 *
 *   bun run famulor:prompt applications/lm-2786630.json
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFamulorPrompt, type PromptSources } from "../pipeline/lib/famulor-prompt.ts";

function fail(message: string): never {
  console.error(`[famulor-prompt] ${message}`);
  process.exit(2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Liest + parst eine JSON-Datei; jeder Fehler (nicht lesbar, kein gültiges JSON) wird zu
 * einer klaren, pfadbenannten Meldung statt eines rohen Bun-Stacktraces. */
function readJson(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(resolve(path), "utf8");
  } catch (err) {
    fail(`Datei nicht lesbar oder kein gültiges JSON: ${path} (${(err as Error).message})`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`Datei nicht lesbar oder kein gültiges JSON: ${path} (${(err as Error).message})`);
  }
}

/** Prüft `voice` minimal, damit der Cast auf PromptSources["voice"] belegt ist. */
function parseVoice(raw: unknown, path: string): PromptSources["voice"] {
  if (
    !isRecord(raw) ||
    typeof raw.intro !== "string" ||
    typeof raw.closing !== "string" ||
    !Array.isArray(raw.rules_extra) ||
    !isRecord(raw.the_role) ||
    typeof raw.the_role.company !== "string" ||
    typeof raw.the_role.title !== "string"
  ) {
    fail(`voice-Block fehlt oder unvollständig in ${path}`);
  }
  return raw as unknown as PromptSources["voice"];
}

const file = process.argv[2];
if (!file) fail("Aufruf: bun run famulor:prompt <applications/<id>.json>");

const ctx = readJson(
  resolve(import.meta.dir, "../pipeline/voice/context-fallback.json"),
) as PromptSources["context"];
const appRaw = readJson(file);
const voice = parseVoice(isRecord(appRaw) ? appRaw.voice : undefined, file);

const p = buildFamulorPrompt({ context: ctx, voice });

process.stdout.write(
  JSON.stringify({ system_prompt: p.systemPrompt, first_message: p.firstMessage }, null, 2) + "\n",
);
