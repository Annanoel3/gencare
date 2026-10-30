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

const SYSTEM = `You help a family share one calendar. Someone added events (typed in, or brought in from their phone's calendar). For each event, decide who it's about, whether the rest of the family should see it, and its category, the way a thoughtful family assistant who knows this family would. Read the events together: one that names someone ("Mom Spero Assessment") tells you who other visits to the same place are probably for.

who: the id of the family profile the event is about: the person or pet who has to be there or whose need it serves (Mom's speech therapy is Mom's, even if someone else drives her). "Mom", "Dad", "Grandma" and the like mean the people with that relationship to the person who added the event: a profile listed as Mother and written by that same person is their Mom. Pets have profiles too ("Kirito ultrasound" is Kirito's). Use "self" when it's about the person who added it (their own trip, their own appointment). Use "" when it's about someone not in the list, or you can't tell. Never guess a profile just to fill the field.

share: be picky. The shared calendar is for what the rest of the family needs to know or plan around, not everything on someone's phone. Share (true): events about the people being cared for, the kids or the pets; family plans and gatherings the family takes part in; household matters; and the person's own flights (the family wants the flight numbers and times). Keep private (false): the person's own appointments and health, the rest of their own trips (hotels, Airbnbs, events while away), their own work (meetings, calls, committee meetings, work deadlines and due dates like "Budget ACTUALS DUE", shifts, trainings, presentations, anything from a work calendar or with a Teams or Zoom link), their own plans with friends, errands, bills and money, gifts or surprises, and anything sensitive. Work is never shared. When unsure, keep it private: showing the family something private does more harm than keeping something to themselves.

trip: true only when the event is clearly part of the person's own trip away from home: their flights, their hotel or Airbnb stay somewhere else, and things they do while away (a destination wedding). The family sees one "<name> traveling" note for the trip. A stay named for someone else or a guest coming to town ("Lorenzo Airbnb" when Lorenzo is visiting) is a visit, not their trip. When unsure, false.

cover: when share is false because it's the person's own appointment that the family would still want to know is happening (a doctor, dentist or eye appointment), a plain label the family sees in its place, with the time and nothing else: "doctor", "dentist", "eye doctor". For anything sensitive (therapy, counseling, intimate health) use just "appointment". "" for everything else (work, friends, errands, money, gifts, trips).

category: Appointment, School, Work, Sports, Social or Other. The person's own job is always Work.

Reply with JSON only: {"events":[{"key":"<the event's key>","who":"<profile id, self, or empty>","share":false,"trip":false,"cover":"","category":"Appointment"}]} with one entry for every event.`;

export type SortMember = { id: string; name: string; relationship?: string; added_by?: string; added_by_id?: string; is_poster?: boolean; is_pet?: boolean };
export type SortItem = { key: string; title: string; notes?: string; location?: string; with?: string; date?: string; time?: string };
export type SortResult = { who: string; self: boolean; share: boolean; trip: boolean; cover: string; category: string };

// "Mom"/"Dad" in a title the model left without a profile: the one Mother /
// Father profile the person who added it made themselves, if there's exactly one.
const MOM = /\b(mom|mommy|mama|mother)\b/i;
const DAD = /\b(dad|daddy|papa|father)\b/i;
function parentFor(title: string, members: SortMember[], posterId: string) {
  const mine = members.filter((m) => !m.is_pet && m.added_by_id && m.added_by_id === posterId);
  const one = (rel: RegExp) => { const hits = mine.filter((m) => rel.test(String(m.relationship || ''))); return hits.length === 1 ? hits[0].id : ''; };
  const mom = MOM.test(title) ? one(/^(mother|mom)$/i) : '';
  const dad = DAD.test(title) ? one(/^(father|dad)$/i) : '';
  return mom && dad ? '' : mom || dad;
}

const clip = (s: unknown, n: number) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Sort up to ~40 events in one call. Returns key -> result; a missing key (or
 * a failed call) means "not sorted", which callers treat as: nobody in
 * particular, not shared, category unchanged.
 */
export async function sortEvents(items: SortItem[], ctx: { poster: string; posterId?: string; members: SortMember[] }): Promise<Map<string, SortResult>> {
  const out = new Map<string, SortResult>();
  if (!items.length) return out;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return out;
  const openai = lean(new OpenAI({ apiKey, timeout: 45000, maxRetries: 1 }), { name: "eventSort" });
  const memberIds = new Set(ctx.members.map((m) => m.id));
  const family = ctx.members.length
    ? ctx.members.map((m) => `- id ${m.id}: ${m.name}${m.is_pet ? ", a pet" : m.relationship ? `, ${m.relationship}${m.added_by ? ` (relationship as written by ${m.added_by})` : ""}` : ""}${m.is_poster ? " (this is the person who added the events)" : ""}`).join("\n")
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
      const posterProfile = ctx.members.find((m) => m.is_poster)?.id || "";
      const titles = new Map(items.map((e) => [e.key, e.title]));
      for (const r of Array.isArray(parsed?.events) ? parsed.events : []) {
        const key = String(r?.key || "");
        if (!key) continue;
        const raw = String(r?.who || "");
        const self = raw === "self";
        let who = self ? posterProfile : memberIds.has(raw) ? raw : "";
        if (!who && !self) who = parentFor(String(titles.get(key) || ""), ctx.members, ctx.posterId || "");
        out.set(key, {
          who,
          self,
          share: r?.share === true,
          trip: r?.trip === true,
          cover: r?.share === true ? "" : String(r?.cover || "").replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 30),
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
  const rows = ((await db.FamilyMember.filter({ family_id: familyId })) || []).filter((m: any) => m.is_active !== false);
  const users = (await db.User.filter({ family_id: familyId })) || [];
  const nameOf = (id: string) => {
    const u = users.find((x: any) => x.id === id || x.email === id);
    return u ? String(u.display_name || u.full_name || u.email || "").split(" ")[0] : "";
  };
  let newest = "";
  const members = rows.map((m: any) => {
    if (String(m.created_date || "") > newest) newest = String(m.created_date || "");
    const addedBy = String(m.created_by_user_id || m.created_by_id || "");
    return {
      id: m.id,
      name: String(m.name || ""),
      // "Self" = the profile of the GenCare user it's linked to.
      relationship: /^self$/i.test(String(m.relationship || "")) ? "" : String(m.relationship || ""),
      added_by: nameOf(addedBy || m.created_by || ""),
      added_by_id: addedBy,
      is_poster: !!posterId && m.linked_user_id === posterId,
      is_pet: /^pet$/i.test(String(m.relationship || "")),
    };
  });
  return { members, newest };
}
