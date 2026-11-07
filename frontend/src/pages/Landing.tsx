import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Inbox,
  ListTodo,
  MessageSquareText,
  Mic,
  Moon,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { ConversationDemo } from '@/components/landing/ConversationDemo';

const ease = [0.22, 1, 0.36, 1] as const;

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

function FeatureCard({ eyebrow, title, text, icon: Icon, children }: { eyebrow: string; title: React.ReactNode; text: string; icon: typeof Clock3; children: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#151515] p-6 md:p-8">
      <div className="absolute right-[-80px] top-[-80px] h-52 w-52 rounded-full bg-white/[0.05] blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[#D6D6D2]">{eyebrow}</span>
          <h3 className="mt-3 max-w-sm text-2xl font-medium tracking-[-0.045em] text-white">{title}</h3>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/40">{text}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"><Icon size={18} className="text-[#D6D6D2]" /></div>
      </div>
      <div className="relative mt-8 flex flex-1 flex-col justify-end">{children}</div>
    </div>
  );
}

function DraftPlanCard() {
  const rows = [
    { title: 'Stats problem set', reason: 'Due tonight', minutes: 100 },
    { title: 'Office hours at 3', reason: 'Bring your pset questions', minutes: 30 },
    { title: 'Finish pitch deck', reason: 'Pitch is Friday', minutes: 75 },
  ];

  return (
    <FeatureCard eyebrow="DRAFT PLAN" title={<>Time is a constraint,<br />not a suggestion.</>} text="Caprio drafts a plan around the hours you actually have. Nothing is saved until you confirm it." icon={Clock3}>
      <div className="rounded-2xl border border-white/[0.08] bg-[#101010] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium text-white">Today’s plan</p>
          <span className="shrink-0 rounded-full bg-[#F5F5F3]/10 px-2.5 py-1 text-[10px] text-[#F5F5F3]">Needs your confirmation</span>
        </div>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/55"><Clock3 size={11} />5h 20m of 6h</span>
        <ol className="mt-3 space-y-1.5">
          {rows.map((row, index) => (
            <li key={row.title} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="font-mono text-[9px] text-white/25">0{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-white/80">{row.title}</span>
                <span className="block truncate text-[10px] text-white/35">{row.reason}</span>
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-white/30">{row.minutes} min</span>
            </li>
          ))}
        </ol>
        <span className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#F5F5F3] px-3.5 text-[11px] font-semibold text-[#090909]">Confirm plan <ArrowRight size={12} /></span>
      </div>
    </FeatureCard>
  );
}

function TodayListCard() {
  const rows = [
    { title: 'Stats problem set', meta: 'School · 100 min' },
    { title: 'Office hours at 3', meta: 'School · 30 min' },
    { title: 'Finish pitch deck', meta: 'Work · 75 min' },
  ];
  const line = (row: { title: string; meta: string }, carried = false) => (
    <li key={row.title} className="flex items-center gap-3 py-2">
      <span className="h-4 w-4 shrink-0 rounded-[5px] border border-white/25" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-white/80">{row.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">{row.meta}{carried && <span className="rounded bg-white/[0.07] px-1.5 py-px text-white/55">From yesterday</span>}</span>
      </span>
    </li>
  );

  return (
    <FeatureCard eyebrow="TODAY" title={<>Your list, with an<br />actual point of view.</>} text="Confirmed tasks land on Today in ranked order. Anything unfinished from yesterday is carried forward, not lost." icon={ListTodo}>
      <div className="rounded-2xl border border-white/[0.08] bg-[#101010] p-4 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Today</p>
        <ol className="mt-1 divide-y divide-white/[0.05]">{rows.map((row) => line(row))}</ol>
        <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 pt-2.5">
          <div className="flex items-center gap-2">
            <ChevronDown size={13} className="text-white/40" />
            <span className="text-[12px] font-medium text-white/75">Carried forward</span>
            <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] text-white/60">1</span>
          </div>
          <ol>{line({ title: 'Email TA about lab report', meta: 'School · 10 min' }, true)}</ol>
        </div>
      </div>
    </FeatureCard>
  );
}

const reviewRows = [
  { title: 'Stats problem set', choice: 'Done' },
  { title: 'Groceries', choice: 'Tomorrow' },
  { title: '1 LeetCode', choice: 'Drop' },
];

const reviewOutcomes = [
  { label: 'Done', icon: Check },
  { label: 'Tomorrow', icon: ArrowRight },
  { label: 'Drop', icon: X },
];

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

          <ConversationDemo />
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
              <Reveal className="h-full"><DraftPlanCard /></Reveal>
              <Reveal delay={0.08} className="h-full"><TodayListCard /></Reveal>
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
                    <p className="text-[10px] font-semibold tracking-[0.16em] text-[#D6D6D2]">CLOSE THE DAY</p>
                    <h3 className="mt-3 text-2xl font-medium tracking-[-0.045em]">Done, tomorrow, or drop.</h3>
                  </div>
                  <Moon size={19} className="text-[#F5F5F3]" />
                </div>
                <div className="mt-10 space-y-2.5">
                  {reviewRows.map((row) => (
                    <div key={row.title} className="rounded-xl border border-white/[0.08] bg-[#0D0D0D] p-3">
                      <p className="text-[12px] font-medium text-white/75">{row.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reviewOutcomes.map(({ label, icon: Icon }) => (
                          <span key={label} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${row.choice === label ? 'border-[#F5F5F3]/40 bg-[#F5F5F3]/10 text-[#F5F5F3]' : 'border-white/[0.08] text-white/35'}`}>
                            <Icon size={11} />{label}
                          </span>
                        ))}
                      </div>
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
          <Logo markClassName="h-[18px]" wordmarkClassName="text-lg" />
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
