import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Inbox,
  Layers3,
  ListTodo,
  MessageSquareText,
  Mic,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const ease = [0.22, 1, 0.36, 1] as const;

type PreviewTask = {
  title: string;
  meta: string;
  color: string;
  rank: string;
  moved?: boolean;
};

const plannedTasks: PreviewTask[] = [
  { title: 'Finalize launch brief', meta: 'Deep work · 90 min', color: '#F5F5F3', rank: '01', moved: false },
  { title: 'Review product metrics', meta: 'Work · 30 min', color: '#B8B8B4', rank: '02', moved: false },
  { title: 'Strength training', meta: 'Health · 45 min', color: '#7A7A76', rank: '03', moved: false },
];

const adaptedTasks: PreviewTask[] = [
  { title: 'Review product metrics', meta: 'Deadline moved up · 30 min', color: '#F5F5F3', rank: '01', moved: true },
  { title: 'Finalize launch brief', meta: 'Protected focus · 60 min', color: '#B8B8B4', rank: '02', moved: false },
  { title: 'Strength training', meta: 'Moved to 5:30 PM · 45 min', color: '#7A7A76', rank: '03', moved: true },
];

const weekDays = [
  { day: 'MON', date: '4' },
  { day: 'TUE', date: '5' },
  { day: 'WED', date: '6' },
  { day: 'THU', date: '7', active: true },
  { day: 'FRI', date: '8' },
];

function Logo({ footer = false }: { footer?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 88"
        fill="none"
        role="img"
        aria-label="Caprio"
        className={footer ? 'h-[18px] w-auto text-[#F5F5F3]' : 'h-5 w-auto text-[#F5F5F3]'}
      >
        <g fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M16 6
               H48
               A6 6 0 0 1 54 12
               C54 26 46 34 32 44
               C46 54 54 62 54 76
               A6 6 0 0 1 48 82
               H16
               A6 6 0 0 1 10 76
               C10 62 18 54 32 44
               C18 34 10 26 10 12
               A6 6 0 0 1 16 6
               Z"
            fill="none"
            strokeWidth="7"
          />
          <path d="M22 78 L32 62 L42 78 Z" stroke="none"/>
        </g>
      </svg>
      <span className={`${footer ? 'text-lg' : 'text-[17px]'} font-semibold tracking-[-0.04em] text-white`}>caprio</span>
    </span>
  );
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ProductPreview() {
  const [adapted, setAdapted] = useState(false);
  const reduceMotion = useReducedMotion();
  const tasks = adapted ? adaptedTasks : plannedTasks;

  return (
    <div className="relative mx-auto mt-16 w-full max-w-[1180px] md:mt-20">
      <div className="absolute inset-x-[12%] -top-10 h-48 rounded-full bg-white/[0.08] blur-[100px]" />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 36, scale: 0.985 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.3, ease }}
        className="relative overflow-hidden rounded-[22px] border border-white/[0.12] bg-[#111111] shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
      >
        <div className="flex h-11 items-center border-b border-white/[0.08] bg-white/[0.025] px-4">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <div className="mx-auto flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-white/35">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F5F5F3] shadow-[0_0_10px_rgba(245,245,243,0.7)]" />
            DAY ONLINE
          </div>
          <span className="w-[54px] text-right text-[10px] text-white/25">08:42</span>
        </div>

        <div className="flex min-h-[520px] text-left md:min-h-[590px]">
          <aside className="hidden w-[184px] shrink-0 border-r border-white/[0.08] bg-black/10 p-4 lg:flex lg:flex-col">
            <Logo />
            <div className="mt-8 space-y-1 text-[12px]">
              <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.07] px-3 py-2.5 text-white">
                <CircleDot size={14} className="text-[#F5F5F3]" /> Today
              </div>
              <div className="flex items-center gap-2.5 px-3 py-2.5 text-white/40"><CalendarDays size={14} /> Schedule</div>
              <div className="flex items-center gap-2.5 px-3 py-2.5 text-white/40"><Inbox size={14} /> Capture</div>
              <div className="flex items-center gap-2.5 px-3 py-2.5 text-white/40"><Layers3 size={14} /> Momentum</div>
            </div>
            <div className="mt-auto rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <div className="flex items-center justify-between text-[10px] text-white/35">
                <span>WEEKLY RHYTHM</span><span className="text-[#F5F5F3]">82%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[82%] rounded-full bg-[#F5F5F3]" />
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
            <div className="flex flex-col justify-between gap-5 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.15em] text-white/35">THURSDAY · AUGUST 7</p>
                <h2 className="mt-1.5 text-xl font-medium tracking-[-0.035em] text-white md:text-2xl">Good morning, Ashwin.</h2>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] text-white/45">
                <Sparkles size={12} className="text-[#F5F5F3]" />
                {adapted ? 'Plan adapted just now' : 'Plan built at 8:00 AM'}
              </div>
            </div>

            <div className="grid gap-5 pt-5 xl:grid-cols-[1.25fr_0.9fr]">
              <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.018] p-3 sm:p-4">
                <div className="grid grid-cols-5 border-b border-white/[0.07] pb-3 pl-9">
                  {weekDays.map((item) => (
                    <div key={item.day} className="text-center">
                      <div className="text-[8px] font-semibold tracking-[0.12em] text-white/25">{item.day}</div>
                      <div className={`mx-auto mt-1 grid h-6 w-6 place-items-center rounded-full text-[10px] ${item.active ? 'bg-[#F5F5F3] font-semibold text-[#090909]' : 'text-white/45'}`}>{item.date}</div>
                    </div>
                  ))}
                </div>

                <div className="relative mt-3 h-[330px] overflow-hidden">
                  {[9, 10, 11, 12, 1, 2, 3, 4].map((time, index) => (
                    <div key={time} className="relative flex h-[41px] items-start">
                      <span className="w-9 shrink-0 -translate-y-1 text-[8px] text-white/20">{time}:00</span>
                      <span className="mt-px h-px flex-1 bg-white/[0.055]" />
                      {index === 1 && <span className="absolute left-9 right-0 top-[18px] h-px bg-white/30"><span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-[#F5F5F3]" /></span>}
                    </div>
                  ))}

                  <motion.div
                    layout
                    transition={{ duration: 0.55, ease }}
                    className="absolute left-[24%] right-[5%] rounded-lg border border-white/25 bg-white/[0.09] px-2.5 py-2"
                    style={{ top: adapted ? 128 : 86, height: adapted ? 52 : 68 }}
                  >
                    <p className="truncate text-[9px] font-medium text-[#F5F5F3]">Finalize launch brief</p>
                    <p className="mt-0.5 text-[8px] text-white/40">{adapted ? '12:00 — 1:00' : '11:00 — 12:30'}</p>
                  </motion.div>
                  <motion.div
                    layout
                    transition={{ duration: 0.55, ease }}
                    className="absolute left-[43%] right-[8%] h-[45px] rounded-lg border border-white/20 bg-white/[0.06] px-2.5 py-2"
                    style={{ top: adapted ? 66 : 174 }}
                  >
                    <p className="truncate text-[9px] font-medium text-[#C8C8C4]">Review metrics</p>
                    <p className="mt-0.5 text-[8px] text-white/35">{adapted ? '10:30 — 11:00' : '1:00 — 1:30'}</p>
                  </motion.div>
                  <motion.div
                    layout
                    transition={{ duration: 0.55, ease }}
                    className="absolute left-[16%] right-[24%] h-[44px] rounded-lg border border-white/15 bg-white/[0.035] px-2.5 py-2"
                    style={{ top: adapted ? 280 : 248 }}
                  >
                    <p className="truncate text-[9px] font-medium text-[#A0A09C]">Strength training</p>
                    <p className="mt-0.5 text-[8px] text-white/25">{adapted ? '5:30 — 6:15' : '3:00 — 3:45'}</p>
                  </motion.div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-[#151515] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-white/35">TODAY'S PRIORITIES</p>
                    <p className="mt-1 text-[11px] text-white/25">Ordered by impact, energy, and time</p>
                  </div>
                  <Target size={16} className="text-[#F5F5F3]" />
                </div>

                <div className="mt-4 space-y-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {tasks.map((task) => (
                      <motion.div
                        layout
                        key={task.title}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.35, ease }}
                        className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                      >
                        <span className="font-mono text-[9px] text-white/20">{task.rank}</span>
                        <span className="h-8 w-[3px] rounded-full" style={{ background: task.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium text-white/80">{task.title}</span>
                          <span className={`mt-0.5 block truncate text-[9px] ${task.moved ? 'text-white/65' : 'text-white/25'}`}>{task.meta}</span>
                        </span>
                        {task.moved && <RefreshCw size={11} className="text-[#F5F5F3]" />}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="mt-auto pt-5">
                  <div className="mb-3 rounded-xl border border-white/[0.07] bg-black/15 p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[0.08]"><Mic size={11} className="text-[#F5F5F3]" /></div>
                      <div>
                        <p className="text-[10px] leading-relaxed text-white/55">“Metrics review moved to 10:30 and I need a shorter focus block.”</p>
                        <p className="mt-1.5 text-[8px] text-white/20">CAPRIO UNDERSTANDS THE CHANGE</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAdapted((current) => !current)}
                    className="group flex w-full items-center justify-between rounded-xl bg-[#F5F5F3] px-4 py-3 text-left text-[#090909] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#151515]"
                  >
                    <span>
                      <span className="block text-[11px] font-semibold">{adapted ? 'Restore morning plan' : 'Adapt to the change'}</span>
                      <span className="mt-0.5 block text-[9px] text-black/55">{adapted ? 'See the original schedule' : 'Watch Caprio reshape the day'}</span>
                    </span>
                    <RefreshCw size={14} className={`transition-transform duration-500 ${adapted ? 'rotate-180' : 'group-hover:rotate-45'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      <p className="mt-4 text-center text-[11px] text-white/25">Interactive preview — try adapting the day</p>
    </div>
  );
}

function CalendarCard() {
  return (
    <div className="relative h-full min-h-[400px] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#151515] p-6 md:p-8">
      <div className="absolute right-[-80px] top-[-80px] h-52 w-52 rounded-full bg-white/[0.06] blur-3xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[#D6D6D2]">CALENDAR</span>
          <h3 className="mt-3 max-w-sm text-2xl font-medium tracking-[-0.045em] text-white">Time is a constraint,<br />not a suggestion.</h3>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/40">Caprio plans around the hours you actually have, protecting focus time without overpacking the day.</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><CalendarDays size={18} className="text-[#D6D6D2]" /></div>
      </div>
      <div className="absolute bottom-[-28px] left-8 right-8 h-40 rotate-[-2deg] rounded-2xl border border-white/[0.08] bg-[#101010] p-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3 text-[9px] text-white/25"><span>THURSDAY 07</span><span>4H 20M PLANNED</span></div>
        <div className="mt-3 grid grid-cols-[36px_1fr] gap-y-2 text-[8px] text-white/20">
          <span>09:00</span><span className="h-7 rounded-md border border-white/25 bg-white/[0.09] px-2 py-2 text-[#F5F5F3]">Focus block</span>
          <span>11:00</span><span className="h-7 rounded-md border border-white/20 bg-white/[0.06] px-2 py-2 text-[#C8C8C4]">Team sync</span>
          <span>14:00</span><span className="h-7 rounded-md border border-white/15 bg-white/[0.035] px-2 py-2 text-[#A0A09C]">Training</span>
        </div>
      </div>
    </div>
  );
}

function PriorityCard() {
  const cards = [
    { title: 'Launch brief', label: 'HIGH IMPACT', color: '#F5F5F3' },
    { title: 'Review metrics', label: 'TIME SENSITIVE', color: '#B8B8B4' },
    { title: 'Strength training', label: 'ENERGY MATCH', color: '#7A7A76' },
  ];

  return (
    <div className="relative h-full min-h-[400px] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#151515] p-6 md:p-8">
      <div className="absolute right-[-80px] top-[-80px] h-52 w-52 rounded-full bg-white/[0.05] blur-3xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[#D6D6D2]">PRIORITIZATION</span>
          <h3 className="mt-3 max-w-sm text-2xl font-medium tracking-[-0.045em] text-white">Your list, with an<br />actual point of view.</h3>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/40">Every task is weighed against urgency, impact, energy, and the rest of your life—not just a due date.</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><ListTodo size={18} className="text-[#D6D6D2]" /></div>
      </div>
      <div className="mt-8 space-y-2">
        {cards.map((card, index) => (
          <div key={card.title} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#101010] px-3.5 py-3 shadow-lg" style={{ transform: `translateX(${index * 6}px)` }}>
            <span className="font-mono text-[9px] text-white/20">0{index + 1}</span>
            <span className="h-7 w-[3px] rounded-full" style={{ background: card.color }} />
            <span className="text-[11px] font-medium text-white/70">{card.title}</span>
            <span className="ml-auto text-[8px] tracking-[0.08em]" style={{ color: card.color }}>{card.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen overflow-hidden bg-[#090909] text-[#F5F5F3] selection:bg-[#F5F5F3] selection:text-[#090909]">
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.025] [background-image:url('data:image/svg+xml,%3Csvg_viewBox=%270_0_180_180%27_xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter_id=%27n%27%3E%3CfeTurbulence_type=%27fractalNoise%27_baseFrequency=%27.9%27_numOctaves=%274%27_stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect_width=%27100%25%27_height=%27100%25%27_filter=%27url(%23n)%27_opacity=%27.8%27/%3E%3C/svg%3E')]" />

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-[#090909]/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5 md:px-8" aria-label="Main navigation">
          <Link to="/" aria-label="Caprio home"><Logo /></Link>
          <div className="hidden items-center gap-8 text-[13px] text-white/45 md:flex">
            <a href="#product" className="transition hover:text-white">Product</a>
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="#philosophy" className="transition hover:text-white">Why Caprio</a>
          </div>
          <div className="flex items-center gap-2.5">
            <Link to="/login" className="hidden px-3 py-2 text-[13px] text-white/55 transition hover:text-white sm:block">Sign in</Link>
            <Link to="/signup" className="group flex items-center gap-2 rounded-full bg-[#F5F5F3] px-4 py-2.5 text-[12px] font-semibold text-[#090909] transition hover:bg-white">
              Start your day <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative px-5 pb-24 pt-40 md:px-8 md:pb-32 md:pt-48">
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
              className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.045] px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.13em] text-[#D6D6D2]"
            >
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-35" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F5F5F3]" /></span>
              YOUR DAY, INTELLIGENTLY ARRANGED
            </motion.div>

            <motion.h1
              initial={reduceMotion ? false : { opacity: 0, y: 22 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.08, ease }}
              className="mx-auto mt-7 max-w-[880px] text-[46px] font-medium leading-[0.98] tracking-[-0.065em] text-white sm:text-[64px] md:text-[82px]"
            >
              Calendar <span className="font-light text-white/25">+</span> prioritization.<br />
              <span className="text-white/42">One operating system</span><br className="sm:hidden" /> <span className="text-white/42">for your day.</span>
            </motion.h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.16, ease }}
              className="mx-auto mt-7 max-w-xl text-[15px] leading-7 text-white/45 md:text-base"
            >
              Caprio turns everything you need to do into a realistic day plan—then reshapes it when life inevitably changes.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.24, ease }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link to="/signup" className="group flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F5F5F3] px-6 text-[13px] font-semibold text-[#090909] transition hover:bg-white sm:w-auto">
                Build my day <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#product" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-6 text-[13px] font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white sm:w-auto">
                See how it works <ChevronRight size={14} />
              </a>
            </motion.div>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={reduceMotion ? undefined : { opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-4 text-[10px] tracking-[0.06em] text-white/20"
            >
              START FREE · NO CREDIT CARD · YOUR CALENDAR STAYS YOURS
            </motion.p>
          </div>

          <ProductPreview />
        </section>

        <section id="product" className="border-y border-white/[0.07] bg-[#101010] px-5 py-24 md:px-8 md:py-32">
          <div className="mx-auto max-w-[1180px]">
            <Reveal className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.18em] text-[#D6D6D2]">ONE SYSTEM, TWO JOBS</p>
                <h2 className="mt-4 text-4xl font-medium leading-[1.04] tracking-[-0.055em] text-white md:text-5xl">Your time and your priorities finally talk.</h2>
              </div>
              <p className="max-w-xl text-[15px] leading-7 text-white/40 md:justify-self-end">Calendars show where time went. To-do lists show an infinite backlog. Caprio connects them, so every priority has a place and every hour has a purpose.</p>
            </Reveal>

            <div className="mt-14 grid gap-5 lg:grid-cols-2">
              <Reveal><CalendarCard /></Reveal>
              <Reveal delay={0.08}><PriorityCard /></Reveal>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-5 py-24 md:px-8 md:py-36">
          <div className="mx-auto max-w-[1180px]">
            <Reveal className="max-w-2xl">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[#D6D6D2]">A DAY THAT CAN THINK</p>
              <h2 className="mt-4 text-4xl font-medium leading-[1.04] tracking-[-0.055em] text-white md:text-5xl">Plan once. Adapt as often as life does.</h2>
            </Reveal>

            <div className="mt-16 grid border-y border-white/[0.08] md:grid-cols-3">
              {[
                { number: '01', icon: Inbox, title: 'Capture everything', text: 'Tasks, ideas, calendar events, and voice notes land in one place. Nothing gets lost between apps.' },
                { number: '02', icon: Sparkles, title: 'Caprio builds the day', text: 'Your available time, deadlines, energy, and life categories shape a plan you can actually finish.' },
                { number: '03', icon: RefreshCw, title: 'The plan stays alive', text: 'Say what changed. Caprio reorders priorities and moves time blocks without unraveling the whole day.' },
              ].map((step, index) => (
                <Reveal key={step.number} delay={index * 0.08} className={`relative py-10 md:px-8 md:py-12 ${index > 0 ? 'border-t border-white/[0.08] md:border-l md:border-t-0' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-white/20">{step.number}</span>
                    <step.icon size={18} className="text-[#F5F5F3]" />
                  </div>
                  <h3 className="mt-14 text-xl font-medium tracking-[-0.035em] text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/38">{step.text}</p>
                </Reveal>
              ))}
            </div>

            <div className="mt-20 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <Reveal className="overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#151515] p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-[#D6D6D2]">SPEAK THE CHANGE</p>
                    <h3 className="mt-3 text-2xl font-medium tracking-[-0.045em]">No replanning spiral.</h3>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.07]"><Mic size={18} className="text-[#F5F5F3]" /></div>
                </div>
                <div className="mt-12 rounded-2xl border border-white/[0.08] bg-[#0D0D0D] p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 items-center gap-[3px] rounded-full bg-white/[0.07] px-3">
                      {[7, 12, 5, 16, 9, 13, 6].map((height, i) => <span key={i} className="w-[2px] rounded-full bg-[#F5F5F3]" style={{ height }} />)}
                    </div>
                    <p className="text-[12px] leading-5 text-white/55">“My 3 PM ran over. Keep the workout, move everything else.”</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                    <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[9px] text-[#D6D6D2]">workout protected</span>
                    <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/35">2 tasks moved</span>
                    <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[9px] text-white/35">day ends 6:15</span>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.08} className="overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#151515] p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-[#D6D6D2]">MOMENTUM, NOT GUILT</p>
                    <h3 className="mt-3 text-2xl font-medium tracking-[-0.045em]">See a balanced life.</h3>
                  </div>
                  <Zap size={19} className="text-[#F5F5F3]" />
                </div>
                <div className="mt-10 space-y-5">
                  {[
                    { label: 'Work', value: 82, color: '#F5F5F3' },
                    { label: 'Health', value: 64, color: '#B8B8B4' },
                    { label: 'Personal', value: 48, color: '#7A7A76' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-2 flex items-center justify-between text-[10px]"><span className="text-white/45">{item.label}</span><span className="text-white/25">{item.value}%</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><motion.div initial={{ width: 0 }} whileInView={{ width: `${item.value}%` }} viewport={{ once: true }} transition={{ duration: 1, ease }} className="h-full rounded-full" style={{ background: item.color }} /></div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="philosophy" className="border-y border-white/[0.07] bg-[#F5F5F3] px-5 py-24 text-[#090909] md:px-8 md:py-32">
          <Reveal className="mx-auto max-w-[980px] text-center">
            <MessageSquareText size={26} className="mx-auto opacity-45" />
            <p className="mt-8 text-[34px] font-medium leading-[1.12] tracking-[-0.055em] sm:text-[46px] md:text-[58px]">
              Most productivity tools help you collect more work. Caprio helps you decide what deserves today.
            </p>
            <div className="mx-auto mt-9 flex w-fit items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-[10px] font-semibold tracking-[0.12em]">
              <Check size={12} /> CALM IS A FEATURE
            </div>
          </Reveal>
        </section>

        <section className="relative px-5 py-28 md:px-8 md:py-40">
          <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.1),transparent_40%)]" />
          <Reveal className="relative mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-7 grid h-14 w-14 place-items-center rounded-2xl bg-[#F5F5F3]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 64 88"
                fill="none"
                role="img"
                aria-label="Caprio"
                className="h-7 w-auto text-[#090909]"
              >
                <g fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path
                    d="M16 6
                       H48
                       A6 6 0 0 1 54 12
                       C54 26 46 34 32 44
                       C46 54 54 62 54 76
                       A6 6 0 0 1 48 82
                       H16
                       A6 6 0 0 1 10 76
                       C10 62 18 54 32 44
                       C18 34 10 26 10 12
                       A6 6 0 0 1 16 6
                       Z"
                    fill="none"
                    strokeWidth="7"
                  />
                  <path d="M22 78 L32 62 L42 78 Z" stroke="none"/>
                </g>
              </svg>
            </div>
            <h2 className="text-4xl font-medium leading-[1.02] tracking-[-0.06em] md:text-6xl">Give your day a brain.</h2>
            <p className="mx-auto mt-6 max-w-lg text-[15px] leading-7 text-white/40">Bring your calendar and priorities together. Start each morning clear, and stay clear when the day changes.</p>
            <Link to="/signup" className="group mx-auto mt-8 flex h-12 w-fit items-center gap-2 rounded-full bg-[#F5F5F3] px-6 text-[13px] font-semibold text-[#090909] transition hover:bg-white">
              Start with Caprio <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-5 sm:flex-row">
          <Logo footer />
          <p className="text-[10px] tracking-[0.08em] text-white/20">CALENDAR + PRIORITIZATION, IN ONE CALM PLACE.</p>
          <div className="flex items-center gap-5 text-[11px] text-white/35">
            <Link to="/login" className="transition hover:text-white">Sign in</Link>
            <Link to="/signup" className="transition hover:text-white">Get started</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
