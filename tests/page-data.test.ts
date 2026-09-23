import { expect, test } from "bun:test";
import { buildReleasedPage, coercePage } from "../pipeline/lib/sitedata.ts";

test("why/contributions/journey werden übernommen und begrenzt", () => {
  const p = coercePage({
    why: { eyebrow: "E", headline: "H", body: ["a", 7, "b"], source_url: "javascript:x", source_label: "L" },
    contributions: {
      items: [{ title: "T", body: "B" }, { title: "" }],
      cases: [{ pill: "P", title: "C", body: "B", caption: "K", url: "https://x.de" }],
    },
    work_sample: {
      lead: "L", journey: Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, body: "b" })),
      note: ["n1"], takeaway: { label: "l", text: "t" },
    },
    fit_heading: { eyebrow: "E", headline: "H" },
    conversation: { eyebrow: "E", headline: "H", body: "B" },
  });
  expect(p?.why?.body).toEqual(["a", "b"]);
  expect(p?.why?.source_url).toBeUndefined();
  expect(p?.contributions?.items).toEqual([{ title: "T", body: "B" }]);
  expect(p?.contributions?.cases?.[0]?.url).toBe("https://x.de");
  expect(p?.work_sample?.journey?.length).toBe(6);
  expect(p?.work_sample?.sandbox_enabled).toBe(false);
  expect(p?.work_sample?.takeaway).toEqual({ label: "l", text: "t" });
  expect(p?.fit_heading?.headline).toBe("H");
  expect(p?.conversation?.body).toBe("B");
});

test("leere Listen fallen weg statt als [] durchzurutschen", () => {
  const p = coercePage({ contributions: { headline: "H", items: [{ title: "" }], cases: [] } });
  expect(p?.contributions).toEqual({ headline: "H" });
});

test("buildReleasedPage: nur Seite, Firma, Titel, gültiger Widget-Key", () => {
  const d = buildReleasedPage({
    company: "X AG", title: "Head", page: { hero: { headline: "H" } }, widgetKey: "wgt_abcdefgh12",
  });
  expect(d).toEqual({
    company: "X AG", title: "Head", page: { hero: { headline: "H" } }, voice: { widget_key: "wgt_abcdefgh12" },
  });
  const e = buildReleasedPage({ company: "X", title: "T", page: null, widgetKey: "bad" });
  expect(e.voice).toBeUndefined();
  expect(e.page).toBeUndefined();
});
