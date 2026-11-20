import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import OpenAI from 'npm:openai';
import { lean } from '../../shared/aiCost.ts';
import { aiOk, aiRefusal } from '../../shared/aiConsent.ts';
import { APP_GUIDE, GUIDE_IDS } from '../../shared/appGuide.ts';

// Help's "Ask a question or submit feedback" (Anna, Nov 20 2026: "an ai chat
// that knows everything about the app. No wrong info allowed. If a user tells
// the chat something that seems like feedback, it will ask the user if they
// want to send it to the dev"). It answers only from shared/appGuide.ts, says
// so when the guide doesn't cover something, can point to a "Show me how"
// walkthrough, and flags feedback; the app then asks before anything is sent
// (with functions/sendSupportRequest). Only with the person's OK for OpenAI
// (shared/aiConsent). Astra writes the answer (Anna's model rule: written for
// the person), Luna if Astra fails.
//
//   { messages: [{ role: 'user' | 'assistant', text }] }  (the last one is the question)
//   → { ok, reply, guide, feedback, feedback_kind, feedback_summary, left }

const MODEL = 'gpt-6-astra';
const BACKUP_MODEL = 'gpt-6-luna';
const PER_DAY = 30; // questions per person per day
const KEEP = 10; // messages of the chat sent along
const MAX_CHARS = 1200;

const SYSTEM = `You are the Help helper inside the GenCare app. People ask you how to use GenCare. Many of them are older and not used to apps.

How to answer:
- Use ONLY the app guide below. Never guess a button, a setting, a step or a feature that isn't in it. If the guide doesn't answer the question, say plainly that you're not sure about that one, and offer to send the question to the person who makes GenCare (set feedback to true and feedback_kind to "question").
- Plain, friendly words. Short sentences. No jargon or tech words. When there are steps, number them, one step per line.
- Write button and page names exactly as the guide does, in **bold** (like **Calendar** or **Add event**).
- Keep it short: under 110 words.
- Answer in the language the person writes in.
- GenCare organizes family care; it isn't medical. Never give medical, legal or money advice. For those, say to ask a doctor, a lawyer or another professional.
- Only help with GenCare. For anything else, say kindly that you can only help with GenCare.
- Never ask for passwords, codes or card numbers.

Show me how: when the person wants to do one of these, put its id in "guide" and say they can tap **Show me how** below to be walked through it on the screen:
${Object.entries(GUIDE_IDS).map(([id, title]) => `- ${id}: ${title}`).join('\n')}

Feedback: when someone says something is wrong but not what, ask what happened first. When the person reports something not working, says something is confusing or missing, wishes it did something, suggests an idea, complains, or praises the app or its maker, that's feedback. Set feedback to true, feedback_kind to "bug" (something broken) or "idea" (everything else), and feedback_summary to one sentence in their own words. Still help with what the guide covers. The app then asks them if they want to send it to the person who makes GenCare, so don't say it was sent and don't ask that question yourself.

Reply with JSON only: {"reply": "", "guide": "", "feedback": false, "feedback_kind": "", "feedback_summary": ""}

${APP_GUIDE}`;

const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function today(tz: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    const user = (await db.User.filter({ id: me.id }))?.[0] || me;
    if (!aiOk(user)) return aiRefusal();

    const body = await req.json().catch(() => ({}));
    const msgs = (Array.isArray(body?.messages) ? body.messages : [])
      .map((m: any) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: clip(m?.text, MAX_CHARS) }))
      .filter((m: any) => m.content)
      .slice(-KEEP);
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return Response.json({ ok: false, error: 'No question' }, { status: 400 });

    // A few dozen a day each, so a stuck loop can't run up the bill.
    const day = today(String(user.timezone || 'America/Chicago'));
    const used = user.help_chat_day === day ? Number(user.help_chat_count || 0) : 0;
    if (used >= PER_DAY) {
      return Response.json({ ok: true, reply: "That's all the questions I can answer today. Tap **Send a message** on the Help page to ask the person who makes GenCare, or come back tomorrow.", guide: '', feedback: false, feedback_kind: '', feedback_summary: '', left: 0 });
    }
    await db.User.update(user.id, { help_chat_day: day, help_chat_count: used + 1 }).catch(() => {});

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return Response.json({ ok: false, error: 'Not set up' }, { status: 500 });
    const openai = lean(new OpenAI({ apiKey, timeout: 45000, maxRetries: 0 }), { name: 'helpChat' });
    let parsed: any = null;
    let lastError: unknown = null;
    for (const model of [MODEL, BACKUP_MODEL]) {
      try {
        const res: any = await openai.chat.completions.create({
          model,
          messages: [{ role: 'system', content: SYSTEM }, ...msgs],
          response_format: { type: 'json_object' },
          reasoning_effort: 'low',
          max_completion_tokens: 2500,
        } as any);
        parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
        if (!clip(parsed?.reply, 10)) throw new Error('empty reply');
        break;
      } catch (e) {
        parsed = null;
        lastError = e;
        console.warn(`[helpChat] ${model} failed:`, (e as Error)?.message || e);
      }
    }
    if (!parsed) return Response.json({ ok: false, error: String((lastError as Error)?.message || 'No answer') }, { status: 502 });

    const guide = Object.prototype.hasOwnProperty.call(GUIDE_IDS, String(parsed.guide || '')) ? String(parsed.guide) : '';
    const feedback = parsed.feedback === true;
    const kind = ['bug', 'idea', 'question'].includes(String(parsed.feedback_kind)) ? String(parsed.feedback_kind) : 'idea';
    console.log(`[helpChat] ${user.email}: ${used + 1} today${guide ? `, guide ${guide}` : ''}${feedback ? `, feedback (${kind})` : ''}`);
    return Response.json({
      ok: true,
      reply: String(parsed.reply || '').trim().slice(0, 1500),
      guide,
      feedback,
      feedback_kind: feedback ? kind : '',
      feedback_summary: feedback ? clip(parsed.feedback_summary, 300) : '',
      left: PER_DAY - used - 1,
    });
  } catch (e) {
    console.error('[helpChat]', (e as Error)?.message || e);
    return Response.json({ ok: false, error: (e as Error)?.message || 'Something went wrong' }, { status: 500 });
  }
});
