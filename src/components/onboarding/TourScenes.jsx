import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format, getDaysInMonth, startOfMonth } from 'date-fns';
import {
  LayoutDashboard, BellRing, CalendarDays, MessageCircle, Users, Heart, Menu, Plus, Megaphone, Mic,
  CircleHelp, PlayCircle, MessageSquareText, Sun, ChevronDown, ArrowUp, Check,
} from 'lucide-react';

// Little moving pictures for the tour (Anna, Nov 20 2026: "show like a visual
// of pressing the home button and scrolling", "Show someone clicking a day on
// a full calendar and then it scrolling down to the days. And show someone
// sorting by family member", "a reminder being created and show the user
// choosing that the reminder is for a specific family member", "Show the user
// tapping on the menu and then help"). Each is a small phone drawn like the
// real screens, with a fingertip that taps and scrolls, playing on a loop.
// The names in them are made up.

const W = 178; // the screen inside the frame
const H = 254;
const TOP = 26; // header
const NAV = 34; // bottom bar

const PEOPLE = {
  mia: { name: 'Mia', dot: 'bg-blue-500' },
  ben: { name: 'Ben', dot: 'bg-purple-500' },
  gpa: { name: 'Grandpa', dot: 'bg-orange-500' },
};

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    try {
      const q = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduce(q.matches);
      const on = () => setReduce(q.matches);
      q.addEventListener?.('change', on);
      return () => q.removeEventListener?.('change', on);
    } catch { return undefined; }
  }, []);
  return reduce;
}

// Frames: [changes, how long to hold]. Each frame keeps everything before it
// unless it changes it; the first frame resets the picture.
function useScene(list) {
  const frames = useMemo(() => {
    const out = [];
    let state = {};
    for (const [changes, ms] of list) { state = { ...state, ...changes }; out.push({ ...state, ms }); }
    return out;
  }, [list]);
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(() => setI((n) => (n + 1) % frames.length), frames[i].ms * (reduce ? 1.5 : 1));
    return () => clearTimeout(t);
  }, [i, frames, reduce]);
  // The jump back to the start, and everything when motion is turned down, happens without sliding.
  return { ...frames[i], still: i === 0 || reduce };
}

const ease = (still, what, ms = 650) => (still ? 'none' : `${what} ${ms}ms ease-in-out`);

// Where the fingertip goes: the middle of the thing marked data-spot="<at>",
// measured from the page's layout (so a page still sliding into place is
// measured where it stops), or a plain x and y.
function useSpot(ref, s) {
  const [p, setP] = useState(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const el = s.at && root?.querySelector(`[data-spot="${s.at}"]`);
    if (!el) return;
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    for (let n = el; n && n !== root; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    if (el.closest('[data-scroller]')) y -= s.scroll || 0;
    setP({ x, y });
  }, [ref, s.at, s.scroll, s.page, s.form, s.menu]);
  return s.at ? p || { x: s.x, y: s.y } : { x: s.x, y: s.y };
}

function Finger({ s, phone }) {
  const at = useSpot(phone, s);
  return (
    <div aria-hidden="true" className="absolute z-30 pointer-events-none"
      style={{ left: at.x, top: at.y, opacity: s.show ? 1 : 0, transition: s.still ? 'none' : 'left 650ms ease-in-out, top 650ms ease-in-out, opacity 250ms' }}>
      <div className="absolute -left-3.5 -top-3.5 w-7 h-7 rounded-full border-2 border-white bg-neutral-700/45 shadow-lg"
        style={{ transform: s.press ? 'scale(0.75)' : 'scale(1)', transition: 'transform 150ms' }} />
      {s.press && <div className="absolute -left-3.5 -top-3.5 w-7 h-7 rounded-full border-2 border-primary animate-ping" />}
    </div>
  );
}

function Header() {
  return (
    <div className="absolute left-0 right-0 top-0 z-10 bg-card border-b border-border flex items-center justify-between px-2" style={{ height: TOP }}>
      <div className="flex items-center gap-1">
        <span className="w-3.5 h-3.5 rounded bg-primary flex items-center justify-center"><Heart className="w-2 h-2 text-primary-foreground" /></span>
        <span className="font-heading text-[9px] font-bold">GenCare</span>
      </div>
      <span data-spot="menu-btn" className="p-0.5"><Menu className="w-3.5 h-3.5 text-foreground" /></span>
    </div>
  );
}

const NAV_ITEMS = [[LayoutDashboard, 'Home'], [BellRing, 'Reminders'], [CalendarDays, 'Calendar'], [MessageCircle, 'Feed'], [Users, 'Family']];
function BottomBar({ active }) {
  return (
    <div className="absolute left-0 right-0 bottom-0 z-10 bg-card border-t border-border flex" style={{ height: NAV }}>
      {NAV_ITEMS.map(([Icon, label], i) => (
        <div key={label} data-spot={`nav-${i}`} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active === i ? 'text-primary' : 'text-muted-foreground'}`}>
          <Icon className="w-3 h-3" />
          <span className="text-[6px] leading-none">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Fab() {
  return <div className="absolute z-10 right-2 w-6 h-6 rounded-full bg-primary shadow flex items-center justify-center" style={{ bottom: NAV + 6 }}><Plus className="w-3 h-3 text-primary-foreground" /></div>;
}

// The page between the header and the bottom bar; scroll moves it up.
function Screen({ s, children }) {
  return (
    <div className="absolute left-0 right-0 overflow-hidden" style={{ top: TOP, bottom: NAV }}>
      <div data-scroller="" style={{ transform: `translateY(${-(s.scroll || 0)}px)`, transition: ease(s.still, 'transform', 900) }}>{children}</div>
    </div>
  );
}

const Phone = React.forwardRef(({ label, children }, ref) => {
  return (
    <div ref={ref} role="img" aria-label={label} className="relative mx-auto rounded-[24px] border-[5px] border-neutral-800 dark:border-neutral-500 bg-background overflow-hidden shadow-md select-none"
      style={{ width: W + 10, height: H + 10 }}>
      {children}
    </div>
  );
});
Phone.displayName = 'Phone';

const Chip = ({ on, dot, children, w, spot }) => (
  <span data-spot={spot} className={`inline-flex items-center justify-center gap-0.5 rounded-full border h-3 text-[6px] ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`} style={{ width: w }}>
    {dot && <span className={`w-1 h-1 rounded-full ${dot}`} />}{children}
  </span>
);

// ── Home ──
function HomePage() {
  const today = new Date();
  return (
    <div className="px-2 pt-2 space-y-1.5">
      <div>
        <div className="flex items-center gap-1"><Sun className="w-2.5 h-2.5 text-accent" /><span className="font-heading text-[10px] font-bold">Good morning</span></div>
        <p className="text-[6px] text-muted-foreground pl-3.5">{format(today, 'EEEE, MMMM d, yyyy')}</p>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-heading text-[8px] font-semibold">Today Across the Family</span>
        <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-1 h-3 text-[6px]"><Megaphone className="w-1.5 h-1.5 text-purple-500" />Announce</span>
      </div>
      <div className="rounded-md border border-purple-200 bg-purple-50 dark:bg-purple-500/10 dark:border-purple-500/30 p-1">
        <p className="text-[5.5px] text-muted-foreground">Announcement from Mia</p>
        <p className="text-[7px]">Dinner is at our house Sunday</p>
      </div>
      {/* Events and to-dos in one list, in the day's order (Nov 23 2026). */}
      <div className="rounded-md border border-border bg-card p-1 space-y-1">
        <Row dot={PEOPLE.gpa.dot} title="Grandpa: Haircut" time="10:00 AM" />
        <Todo title="Call the pharmacy" time="12:00 PM" />
        <Row dot={PEOPLE.ben.dot} title="Ben: Soccer practice" time="5:00 PM" />
        <p className="text-[5.5px] font-semibold text-muted-foreground pt-0.5">Still to do</p>
        <Todo title="Take out the trash" />
      </div>
      <div className="rounded-md border border-border bg-card p-1">
        <p className="font-heading text-[8px] font-semibold">Next appointment</p>
        <div className="flex items-center justify-between mt-0.5">
          <div><p className="text-[7px]">Grandpa: Haircut</p><p className="text-[5.5px] text-muted-foreground">Tomorrow 10:00 AM</p></div>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-600 text-white px-1.5 h-3.5 text-[6px] font-semibold"><Mic className="w-1.5 h-1.5" />Record</span>
        </div>
      </div>
      <p className="font-heading text-[8px] font-semibold pt-1">Who did what</p>
      <div className="rounded-md border border-border bg-card p-1 space-y-0.5 mb-2">
        <p className="text-[6px]">Ben checked off "Feed the dog"</p>
        <p className="text-[6px]">Mia added "Piano recital"</p>
      </div>
    </div>
  );
}
const Row = ({ dot, title, time }) => (
  <div className="flex items-center gap-1"><span className={`w-0.5 h-3 rounded ${dot}`} /><span className="text-[6.5px] flex-1 truncate">{title}</span><span className="text-[5.5px] text-muted-foreground">{time}</span></div>
);
const Todo = ({ title, who, time }) => (
  <div className="flex items-center gap-1">
    <div className="flex-1 min-w-0">
      <p className="text-[6.5px] truncate">{title}</p>
      {time && <p className="text-[5.5px] text-muted-foreground">{time}</p>}
      {who && <p className="text-[5.5px] text-muted-foreground flex items-center gap-0.5"><span className={`w-1 h-1 rounded-full ${who.dot}`} />{who.name}</p>}
    </div>
    <span className="rounded bg-primary text-primary-foreground px-1 h-3 text-[6px] inline-flex items-center gap-px"><Check className="w-1.5 h-1.5" />Done</span>
  </div>
);

// ── Calendar ──
const CAL = { gridTop: 80, rowH: 18, colW: (W - 8) / 7, left: 4 };
const CHIPS = [['all', 'Everyone', 34], ['mia', 'Mia', 22], ['ben', 'Ben', 22], ['gpa', 'Grandpa', 32]];
const CHIP_Y = 47;
const TODAY_EVENTS = [['gpa', 'Haircut', '10:00 AM'], ['mia', 'Piano lesson', '3:30 PM'], ['ben', 'Soccer practice', '5:00 PM']];
function eventsOn(d, todayD) {
  if (d === todayD) return TODAY_EVENTS.map((e) => e[0]);
  const out = [];
  if (d % 3 === 0) out.push('mia');
  if (d % 4 === 1) out.push('ben');
  if (d % 5 === 2) out.push('gpa');
  return out.slice(0, 2);
}
function useMonth() {
  return useMemo(() => {
    const now = new Date();
    return { now, first: startOfMonth(now).getDay(), days: getDaysInMonth(now), today: now.getDate() };
  }, []);
}
function cellCenter(m, d) {
  const n = m.first + d - 1;
  return { x: CAL.left + CAL.colW * ((n % 7) + 0.5), y: CAL.gridTop + CAL.rowH * Math.floor(n / 7) + CAL.rowH / 2 };
}

function CalendarPageMini({ s, m }) {
  const who = s.who || 'all';
  const list = TODAY_EVENTS.filter(([k]) => who === 'all' || k === who);
  const rows = Math.ceil((m.first + m.days) / 7);
  const listTop = CAL.gridTop + rows * CAL.rowH + 8;
  return (
    <div className="relative" style={{ height: listTop + 90 }}>
      <div className="absolute left-2 top-1 flex items-center gap-1"><CalendarDays className="w-2.5 h-2.5 text-primary" /><span className="font-heading text-[10px] font-bold">Calendar</span></div>
      <div className="absolute left-2 right-2 flex gap-1" style={{ top: 21 }}>
        <span className="flex-1 h-3.5 rounded bg-primary text-primary-foreground text-[6px] flex items-center justify-center gap-0.5"><Plus className="w-1.5 h-1.5" />Add event</span>
        <span className="flex-1 h-3.5 rounded border border-border bg-card text-[6px] flex items-center justify-center">··· More</span>
      </div>
      <div className="absolute flex gap-[3px]" style={{ left: 6, top: CHIP_Y - 6 }}>
        {CHIPS.map(([k, label, w]) => <Chip key={k} spot={`chip-${k}`} on={who === k} dot={PEOPLE[k]?.dot} w={w}>{label}</Chip>)}
      </div>
      <p className="absolute left-2 text-[5.5px] text-muted-foreground" style={{ top: CHIP_Y + 8 }}>{who === 'all' ? 'Tap a name to see only their events.' : `Showing only ${PEOPLE[who].name}'s events.`}</p>
      <p className="absolute left-0 right-0 text-center font-heading text-[7.5px] font-semibold" style={{ top: CAL.gridTop - 16 }}>{format(m.now, 'MMMM yyyy')}</p>
      <div className="absolute flex" style={{ left: CAL.left, top: CAL.gridTop - 7 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="text-[5px] text-muted-foreground text-center" style={{ width: CAL.colW }}>{d}</span>)}
      </div>
      {Array.from({ length: m.days }, (_, i) => i + 1).map((d) => {
        const c = cellCenter(m, d);
        const picked = s.sel && d === m.today;
        const evs = eventsOn(d, m.today).filter((k) => who === 'all' || k === who);
        return (
          <div key={d} data-spot={d === m.today ? 'today' : undefined} className={`absolute rounded-sm ${picked ? 'bg-primary/15 ring-1 ring-primary' : ''}`}
            style={{ left: c.x - CAL.colW / 2 + 0.5, top: c.y - CAL.rowH / 2 + 0.5, width: CAL.colW - 1, height: CAL.rowH - 1 }}>
            <span className={`block w-fit mx-0.5 px-0.5 rounded-full text-[5.5px] leading-[8px] ${d === m.today ? 'bg-primary text-primary-foreground' : 'text-foreground/80'}`}>{d}</span>
            <div className="flex flex-col gap-px px-0.5 mt-px">{evs.slice(0, 2).map((k) => <span key={k} className={`h-[3px] rounded-sm ${PEOPLE[k].dot}`} />)}</div>
          </div>
        );
      })}
      <div className="absolute left-1.5 right-1.5 rounded-md border border-border bg-card p-1.5" style={{ top: listTop }}>
        <p className="text-[6px] text-primary font-medium flex items-center gap-0.5"><ArrowUp className="w-1.5 h-1.5" />Back to calendar</p>
        <p className="font-heading text-[8px] font-semibold mt-0.5">{format(m.now, 'EEEE, MMMM d')}</p>
        <div className="space-y-1 mt-1">
          {list.map(([k, title, time]) => (
            <div key={k} className="flex items-center gap-1 rounded border border-border/70 p-0.5">
              <span className={`w-0.5 h-4 rounded ${PEOPLE[k].dot}`} />
              <div className="flex-1 min-w-0"><p className="text-[6.5px] truncate">{PEOPLE[k].name}: {title}</p><p className="text-[5.5px] text-muted-foreground">{time}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reminders ──
const FOR_CHIPS = [['all', 'Whole family', 40], ['mia', 'Mia', 20], ['ben', 'Ben', 20], ['gpa', 'Grandpa', 32]];
function RemindersPageMini({ s }) {
  return (
    <div className="px-2 pt-2 space-y-1.5" style={{ minHeight: 200 }}>
      <div className="flex items-center gap-1"><BellRing className="w-2.5 h-2.5 text-primary" /><span className="font-heading text-[10px] font-bold">Reminders</span></div>
      <p className="text-[5.5px] text-muted-foreground">Events, reminders and things to do. Anyone in the family can tick them off.</p>
      <div className="flex gap-1 items-center">
        <span data-spot="quick" className={`flex-1 h-4 rounded border bg-card px-1 text-[6.5px] flex items-center ${s.typing ? 'border-primary ring-1 ring-primary/40' : 'border-border'}`}>
          {s.text ? <span>{s.text}<span className={s.typing ? 'animate-pulse' : 'opacity-0'}>|</span></span> : <span className="text-muted-foreground">Add a reminder…</span>}
        </span>
        <span data-spot="plus" className="w-4 h-4 rounded bg-primary flex items-center justify-center"><Plus className="w-2 h-2 text-primary-foreground" /></span>
      </div>
      <div className="grid grid-cols-2 gap-0.5 rounded bg-muted p-0.5 text-[6px] text-center">
        <span className="rounded bg-card py-0.5">Reminders</span><span className="py-0.5 text-muted-foreground">Done</span>
      </div>
      <p className="font-heading text-[7px] font-semibold">Today</p>
      <div className="rounded-md border border-border bg-card p-1 space-y-1">
        {s.added && <Todo title="Call the pharmacy" who={PEOPLE.gpa} />}
        <Todo title="Water the plants" who={PEOPLE.mia} />
        <Todo title="Take out the trash" />
      </div>
    </div>
  );
}
function ReminderFormMini({ s }) {
  return (
    <div className="absolute inset-x-1.5 z-20 rounded-lg border border-border bg-background shadow-xl p-2 space-y-1.5"
      style={{ top: 40, opacity: s.form ? 1 : 0, transform: s.form ? 'translateY(0)' : 'translateY(14px)', transition: ease(s.still, 'opacity 250ms, transform', 250), pointerEvents: 'none' }}>
      <p className="font-heading text-[9px] font-semibold">New reminder</p>
      <div><p className="text-[6px] font-medium">What</p><div className="h-4 rounded border border-border bg-card px-1 text-[6.5px] flex items-center">Call the pharmacy</div></div>
      <div><p className="text-[6px] font-medium">How often</p>
        <div className="flex gap-0.5 mt-0.5"><Chip on w={44}>Until it's done</Chip><Chip w={30}>One time</Chip><Chip w={32}>Every day</Chip></div>
      </div>
      <div><p className="text-[6px] font-medium">When</p>
        <div className="grid grid-cols-2 gap-1 mt-0.5"><span className="h-3.5 rounded border border-border bg-card px-1 text-[6px] flex items-center">Today</span><span className="h-3.5 rounded border border-border bg-card px-1 text-[6px] flex items-center">2:00 PM</span></div>
      </div>
      <div><p className="text-[6px] font-medium">For</p>
        <div className="flex gap-[3px] mt-0.5">{FOR_CHIPS.map(([k, label, w]) => <Chip key={k} spot={`for-${k}`} w={w} on={(s.for || 'all') === k}>{label}</Chip>)}</div>
      </div>
      <div className="flex justify-end pt-0.5"><span data-spot="add" className="h-4 px-2.5 rounded bg-primary text-primary-foreground text-[7px] font-medium flex items-center">Add</span></div>
    </div>
  );
}

// ── Menu and Help ──
const MENU_ROWS = [
  ['Home', LayoutDashboard], ['Family', Users, 'group'], ['Feed', MessageCircle, 'sub'], ['Calendar', CalendarDays, 'sub'], ['Family Members', Users, 'sub'],
  ['Tools', null, 'group'], ['Reminders', BellRing, 'sub'], ['Care Log', Heart, 'sub'], ['Recordings', Mic, 'sub'], ['Resources', null], ['Help', CircleHelp], ['Settings', null],
];
const MENU_ROW = 15;
function MenuMini({ s }) {
  return (
    <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0 bg-black/50" style={{ opacity: s.menu ? 1 : 0, transition: ease(s.still, 'opacity', 250) }} />
      <div className="absolute left-0 top-0 bottom-0 bg-card shadow-xl px-1.5" style={{ width: 124, transform: s.menu ? 'translateX(0)' : 'translateX(-130px)', transition: ease(s.still, 'transform', 300) }}>
        <div className="flex items-center gap-1 h-7 px-1">
          <span className="w-4 h-4 rounded bg-primary flex items-center justify-center"><Heart className="w-2 h-2 text-primary-foreground" /></span>
          <span className="font-heading text-[9px] font-bold">GenCare</span>
        </div>
        {MENU_ROWS.map(([label, Icon, kind]) => (
          <div key={label} data-spot={`menu-${label}`} className={`flex items-center gap-1 rounded ${kind === 'sub' ? 'ml-3' : ''} ${s.pick === label ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'} px-1`} style={{ height: MENU_ROW }}>
            {Icon ? <Icon className="w-2 h-2" /> : <span className="w-2" />}
            <span className="text-[7px] flex-1">{label}</span>
            {kind === 'group' && <ChevronDown className="w-2 h-2" />}
          </div>
        ))}
      </div>
    </div>
  );
}
const GUIDE_TITLES = ['Put something on the calendar', 'Add a reminder', 'Check something off', 'Make the words bigger'];
function HelpPageMini({ s }) {
  return (
    <div className="px-2 pt-2 space-y-1.5">
      <div className="flex items-center gap-1"><CircleHelp className="w-2.5 h-2.5 text-primary" /><span className="font-heading text-[10px] font-bold">Help</span></div>
      <div className={`h-6 rounded-lg bg-primary text-primary-foreground text-[7px] font-medium flex items-center justify-center gap-1 ${s.glow ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-background' : ''}`}><MessageSquareText className="w-2.5 h-2.5" />Ask a question or submit feedback</div>
      <div className="h-6 rounded-lg border-2 border-primary/30 text-[7px] font-medium flex items-center justify-center gap-1"><PlayCircle className="w-2.5 h-2.5 text-primary" />Take the quick tour again</div>
      <p className="font-heading text-[7.5px] font-semibold pt-0.5">Show me how</p>
      {GUIDE_TITLES.map((t) => (
        <div key={t} className="rounded-md border border-border bg-card px-1.5 h-5 flex items-center justify-between">
          <span className="text-[6.5px]">{t}</span><span className="text-[6px] text-primary font-medium flex items-center gap-0.5"><PlayCircle className="w-2 h-2" />Show me</span>
        </div>
      ))}
    </div>
  );
}

// ── The scenes ──
// Off the screen at the bottom right, where a hand comes from.
const AWAY = { x: 150, y: 215, at: '' };

const HOME_SCENE = [
  [{ ...AWAY, page: 'cal', nav: 2, show: false, press: false, scroll: 0 }, 700],
  [{ show: true, at: 'nav-0' }, 900],
  [{ press: true }, 220],
  [{ press: false, page: 'home', nav: 0 }, 800],
  [{ at: '', x: 120, y: 175 }, 700],
  [{ press: true }, 200],
  [{ y: 60, scroll: 125 }, 1000],
  [{ press: false, show: false }, 2200],
];
export function HomeScene() {
  const s = useScene(HOME_SCENE);
  const m = useMonth();
  const ref = useRef(null);
  return (
    <Phone ref={ref} label="A finger taps Home at the bottom, and the Home screen scrolls down past today's events and to-dos and the next appointment.">
      <Header />
      <Screen s={s}>{s.page === 'home' ? <HomePage /> : <CalendarPageMini s={{}} m={m} />}</Screen>
      <Fab />
      <BottomBar active={s.nav} />
      <Finger s={s} phone={ref} />
    </Phone>
  );
}

export function CalendarScene() {
  const m = useMonth();
  const frames = useMemo(() => {
    const rows = Math.ceil((m.first + m.days) / 7);
    const listScroll = CAL.gridTop + rows * CAL.rowH - 10;
    return [
      [{ ...AWAY, page: 'home', nav: 0, show: false, press: false, scroll: 0, sel: false, who: 'all' }, 700],
      [{ show: true, at: 'nav-2' }, 850],
      [{ press: true }, 220],
      [{ press: false, page: 'cal', nav: 2 }, 700],
      [{ at: 'today' }, 850],
      [{ press: true }, 220],
      [{ press: false, sel: true }, 450],
      [{ show: false, scroll: listScroll }, 1000],
      [{}, 1900],
      [{ scroll: 0 }, 900],
      [{ show: true, at: 'chip-ben' }, 850],
      [{ press: true }, 220],
      [{ press: false, who: 'ben' }, 900],
      [{ show: false, scroll: listScroll }, 1000],
      [{}, 2000],
    ];
  }, [m]);
  const s = useScene(frames);
  const ref = useRef(null);
  return (
    <Phone ref={ref} label="A finger taps Calendar, taps a day, and the screen scrolls down to that day's events. Then it taps one person's name, and only their events show.">
      <Header />
      <Screen s={s}>{s.page === 'cal' ? <CalendarPageMini s={s} m={m} /> : <HomePage />}</Screen>
      <Fab />
      <BottomBar active={s.nav} />
      <Finger s={s} phone={ref} />
    </Phone>
  );
}

const REMINDER_SCENE = [
  [{ ...AWAY, page: 'home', nav: 0, show: false, press: false, text: '', typing: false, form: false, for: 'all', added: false }, 700],
  [{ show: true, at: 'nav-1' }, 850],
  [{ press: true }, 220],
  [{ press: false, page: 'tasks', nav: 1 }, 650],
  [{ at: 'quick' }, 800],
  [{ press: true }, 200],
  [{ press: false, typing: true, show: false }, 350],
  [{ text: 'Call' }, 300],
  [{ text: 'Call the' }, 300],
  [{ text: 'Call the pharmacy' }, 600],
  [{ show: true, at: 'plus' }, 750],
  [{ press: true }, 220],
  [{ press: false, typing: false, text: '', form: true }, 700],
  [{ at: 'for-gpa' }, 900],
  [{ press: true }, 220],
  [{ press: false, for: 'gpa' }, 800],
  [{ at: 'add' }, 800],
  [{ press: true }, 220],
  [{ press: false, form: false, added: true, show: false }, 2600],
];
export function ReminderScene() {
  const s = useScene(REMINDER_SCENE);
  const ref = useRef(null);
  return (
    <Phone ref={ref} label="A finger taps Reminders, types Call the pharmacy, taps the plus, picks Grandpa under For, and taps Add. The reminder shows on the list for Grandpa.">
      <Header />
      <Screen s={s}>{s.page === 'tasks' ? <RemindersPageMini s={s} /> : <HomePage />}</Screen>
      <ReminderFormMini s={s} />
      <Fab />
      <BottomBar active={s.nav} />
      <Finger s={s} phone={ref} />
    </Phone>
  );
}

const HELP_SCENE = [
  [{ ...AWAY, page: 'home', show: false, press: false, menu: false, pick: '', glow: false, scroll: 0 }, 700],
  [{ show: true, at: 'menu-btn' }, 900],
  [{ press: true }, 220],
  [{ press: false, menu: true }, 700],
  [{ at: 'menu-Help' }, 850],
  [{ press: true, pick: 'Help' }, 250],
  [{ press: false }, 300],
  [{ menu: false, page: 'help', show: false }, 900],
  [{ glow: true }, 900],
  [{ glow: false }, 500],
  [{ glow: true }, 1600],
];
export function HelpScene() {
  const s = useScene(HELP_SCENE);
  const ref = useRef(null);
  return (
    <Phone ref={ref} label="A finger taps the menu at the top right, then taps Help. The Help page opens, with Ask a question or submit feedback at the top.">
      <Header />
      <Screen s={s}>{s.page === 'help' ? <HelpPageMini s={s} /> : <HomePage />}</Screen>
      <Fab />
      <BottomBar active={s.page === 'help' ? -1 : 0} />
      <MenuMini s={s} />
      <Finger s={s} phone={ref} />
    </Phone>
  );
}
