import OpenAI from "npm:openai";
import { lean } from "./aiCost.ts";

// Sorting family calendar events: who each one is about, whether the family
// should see it, and its category. Used for events brought in from a phone
// calendar (functions/phoneCalendar, a batch at a time) and for a new event
// added in the app (one at a time, when its sharing or "For" was left to
// GenCare). The person's own choices always win: this only fills what they
// left alone, and the app records which fields it filled (auto_set) so it
// never overrides something a person picked.
//
// Astra makes the call (it's a judgment about people's lives, so Anna's model
// rule applies), at low effort: it's a short read, not a long one.

const MODEL = "gpt-6-astra";
const BACKUP_MODEL = "gpt-6-luna";
export const SORT_CATEGORIES = ["Appointment", "School", "Work", "Sports", "Social", "Other"];

const SYSTEM = `You help a family share one calendar. Someone added events (typed in, or brought in from their phone's calendar). For each event, decide three things the way a thoughtful family assistant who knows this family would.

who: the id of the family profile the event is about — the person who has to be there or whose need it serves (Mom's speech therapy is Mom's, even if someone else drives her). Read names, nicknames and relationships the way the person who added it would mean them: "Mom" from someone means that person's mother. Use "" when it's about the person who added it and they have no profile, about a pet, a friend, a coworker, anyone not in the list, or when you can't tell. Never guess a profile just to fill the field.

share: true when the rest of the family would want it on the shared calendar — appointments and care, school and kids' activities, family plans and gatherings, travel, things that affect the household or that others may need to help with or plan around. false when it's the person's own life: plans with friends, dates, their own work meetings and shifts, personal errands, gifts or surprises for someone in the family, and anything sensitive (their own therapy, legal, money or intimate health matters). When unsure, false: showing the family something private does more harm than keeping something to themselves.

category: Appointment, School, Work, Sports, Social or Other.

Reply with JSON only: {"events":[{"key":"<the event's key>","who":"<profile id or empty>","share":true,"category":"Appointment"}]} with one entry for every event.`;

export type SortMember = { id: string; name: string; relationship?: string; added_by?: string; is_poster?: boolean };
export type SortItem = { key: string; title: string; notes?: string; location?: string; with?: string; date?: string; time?: string };
export type SortResult = { who: string; share: boolean; category: string };

const clip = (s: unknown, n: number) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Sort up to ~40 events in one call. Returns key -> result; a missing key (or
 * a failed call) means "not sorted", which callers treat as: nobody in
 * particular, not shared, category unchanged.
 */
export async function sortEvents(items: SortItem[], ctx: { poster: string; members: SortMember[] }): Promise<Map<string, SortResult>> {
  const out = new Map<string, SortResult>();
  if (!items.length) return out;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return out;
  const openai = lean(new OpenAI({ apiKey, timeout: 45000, maxRetries: 1 }), { name: "eventSort" });
  const memberIds = new Set(ctx.members.map((m) => m.id));
  const family = ctx.members.length
    ? ctx.members.map((m) => `- id ${m.id}: ${m.name}${m.relationship ? `, ${m.relationship}` : ""}${m.added_by ? ` (relationship as written by ${m.added_by})` : ""}${m.is_poster ? " — this is the person who added the events" : ""}`).join("\n")
    : "(no profiles yet)";
  const events = items.map((e) => ({
    key: e.key,
    title: clip(e.title, 140),
    ...(e.date ? { when: `${e.date}${e.time ? ` ${e.time}` : ""}` } : {}),
    ...(e.location ? { where: clip(e.location, 80) } : {}),
    ...(e.with ? { with: clip(e.with, 60) } : {}),
    ...(e.notes ? { notes: clip(e.notes, 200) } : {}),
  }));
  const prompt = `Added by: ${ctx.poster || "a family member"}\n\nFamily profiles:\n${family}\n\nEvents:\n${JSON.stringify(events)}`;
  for (const model of [MODEL, BACKUP_MODEL]) {
    try {
      const res: any = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        max_completion_tokens: 6000,
      } as any);
      const parsed = JSON.parse(res?.choices?.[0]?.message?.content || "{}");
      for (const r of Array.isArray(parsed?.events) ? parsed.events : []) {
        const key = String(r?.key || "");
        if (!key) continue;
        out.set(key, {
          who: memberIds.has(String(r?.who || "")) ? String(r.who) : "",
          share: r?.share === true,
          category: SORT_CATEGORIES.includes(String(r?.category)) ? String(r.category) : "",
        });
      }
      return out;
    } catch (e) {
      console.error(`[eventSort] ${model} failed:`, (e as any)?.message || e);
    }
  }
  return out;
}

/** Family profiles as the sorter sees them. */
export async function sortMembers(db: any, familyId: string, posterId: string): Promise<{ members: SortMember[]; newest: string }> {
  const rows = (await db.FamilyMember.filter({ family_id: familyId })) || [];
  const users = (await db.User.filter({ family_id: familyId })) || [];
  const nameOf = (id: string) => {
    const u = users.find((x: any) => x.id === id || x.email === id);
    return u ? String(u.display_name || u.full_name || u.email || "").split(" ")[0] : "";
  };
  let newest = "";
  const members = rows.map((m: any) => {
    if (String(m.created_date || "") > newest) newest = String(m.created_date || "");
    return {
      id: m.id,
      name: String(m.name || ""),
      relationship: String(m.relationship || ""),
      added_by: nameOf(m.created_by_user_id || m.created_by_id || m.created_by || ""),
      is_poster: !!posterId && m.linked_user_id === posterId,
    };
  });
  return { members, newest };
}
