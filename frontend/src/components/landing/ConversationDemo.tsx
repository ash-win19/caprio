import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUp, Check, ChevronDown, Clock3, ListChecks, Mic, RotateCcw } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;
const TICK = 50;

const DUMP = 'finish pitch deck, reply to Carter, gym, groceries, CS problem set due tonight, call mom';
const QUESTION = 'Got it, six things. How many hours do you have today?';
const ANSWER = 'about 6';
const REPLY = 'That fits. The problem set goes first since it’s due tonight, then the deck before your investor call. Gym stays in to protect your energy. Here’s a draft. Nothing is saved until you confirm.';
const AVAILABLE_MINUTES = 360;

const PLAN = [
  { title: 'CS problem set', reason: 'Due tonight', minutes: 120, category: 'School' },
  { title: 'Finish pitch deck', reason: 'Blocks investor call', minutes: 90, category: 'Work' },
  { title: 'Reply to Carter', reason: 'He’s waiting on you', minutes: 15, category: 'Work' },
  { title: 'Gym', reason: 'Protects your energy', minutes: 45, category: 'Health' },
  { title: 'Groceries', reason: 'On the way home', minutes: 20, category: 'Personal' },
  { title: 'Call mom', reason: 'Winds down the evening', minutes: 20, category: 'Personal' },
];

const CARRIED = [{ title: 'Email TA about lab report', minutes: 10, category: 'School' }];

const CATEGORY_COLORS: Record<string, string> = { School: '#F5F5F3', Work: '#C8C8C4', Health: '#9A9A96', Personal: '#6E6E6A' };

const plannedMinutes = PLAN.reduce((sum, task) => sum + task.minutes, 0);

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const CAPACITY = `${hours(plannedMinutes)} of ${hours(AVAILABLE_MINUTES)}`;

const TYPE_DUMP_MS = 24;
const TYPE_ANSWER_MS = 90;
const STREAM_QUESTION_MS = 22;
const STREAM_REPLY_MS = 16;

function buildTimeline() {
  let t = 700;
  const dumpTyping = t;
  t += DUMP.length * TYPE_DUMP_MS + 350;
  const dumpSent = t;
  t += 900;
  const questionStart = t;
  t += QUESTION.length * STREAM_QUESTION_MS;
  const questionEnd = t;
  t += 700;
  const answerTyping = t;
  t += ANSWER.length * TYPE_ANSWER_MS + 350;
  const answerSent = t;
  t += 1000;
  const replyStart = t;
  t += REPLY.length * STREAM_REPLY_MS;
  const replyEnd = t;
  t += 1200;
  const card = t;
  t += 3400;
  const confirm = t;
  t += 800;
  const today = t;
  t += 1200;
  return { dumpTyping, dumpSent, questionStart, questionEnd, answerTyping, answerSent, replyStart, replyEnd, card, confirm, today, end: t };
}

const T = buildTimeline();

function reveal(text: string, start: number, msPerChar: number, t: number) {
  return text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - start) / msPerChar))));
}

function Bubble({ role, children, animate }: { role: 'user' | 'assistant'; children: React.ReactNode; animate: boolean }) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
      className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[88%] rounded-2xl py-2.5 text-[12px] leading-relaxed sm:text-[13px] ${role === 'user' ? 'bg-white/[0.08] px-3.5 text-white/85' : 'px-1 text-white/70'}`}>
        {children}
      </div>
    </motion.div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-2.5 text-[12px] text-white/40 sm:text-[13px]">
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-white/50"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1, repeat: Infinity, delay: dot * 0.16 }}
          />
        ))}
      </span>
      Thinking…
    </div>
  );
}

function Cursor() {
  return <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-white/70" />;
}

function DraftPlan({ confirming, animate }: { confirming: boolean; animate: boolean }) {
  return (
    <motion.section
      initial={animate ? { opacity: 0, y: 28 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease }}
      className="rounded-2xl border border-white/[0.14] bg-[#151515] p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-medium text-white">Today’s plan</h3>
        <span className="shrink-0 rounded-full bg-[#F5F5F3]/10 px-2.5 py-1 text-[10px] text-[#F5F5F3]">Needs your confirmation</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/60">
          <Clock3 size={11} />
          {CAPACITY}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span className="block h-full rounded-full bg-[#F5F5F3]/70" style={{ width: `${(plannedMinutes / AVAILABLE_MINUTES) * 100}%` }} />
        </span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {PLAN.map((task, index) => (
          <motion.li
            key={task.title}
            initial={animate ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: animate ? 0.15 + index * 0.06 : 0, ease }}
            className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-1 sm:py-1.5"
          >
            <span className="font-mono text-[9px] text-white/25">0{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-white/85">{task.title}</span>
              <span className="block truncate text-[10px] text-white/40">{task.reason}</span>
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-white/35">{task.minutes} min</span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-2.5 text-[10px] leading-4 text-white/30">Confirming saves this plan.</p>
      <div className="mt-2.5 flex items-center gap-2">
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[11px] font-semibold text-[#090909] transition duration-200 ${confirming ? 'scale-[0.97] bg-white shadow-[0_0_0_4px_rgba(245,245,243,0.18)]' : 'bg-[#F5F5F3]'}`}>
          {confirming ? 'Saving plan…' : 'Confirm plan'}
          <ArrowRight size={12} />
        </span>
        <span className="inline-flex h-8 items-center px-3 text-[11px] text-white/40">Discard</span>
      </div>
    </motion.section>
  );
}

function Composer({ text }: { text: string }) {
  return (
    <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 sm:px-8">
      <div className="mx-auto flex max-w-[600px] items-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.035] py-2 pl-3.5 pr-2">
        <span className={`min-w-0 flex-1 truncate text-[12px] sm:text-[13px] ${text ? 'text-white/85' : 'text-white/25'}`}>
          {text || 'Tell me what you need to do…'}
          {text && <Cursor />}
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center text-white/40"><Mic size={14} /></span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${text ? 'bg-[#F5F5F3] text-[#090909]' : 'bg-white/[0.08] text-white/30'}`}><ArrowUp size={14} /></span>
      </div>
    </div>
  );
}

function ChatView({ t, animate }: { t: number; animate: boolean }) {
  const composer = t >= T.answerTyping && t < T.answerSent
    ? reveal(ANSWER, T.answerTyping, TYPE_ANSWER_MS, t)
    : t >= T.dumpTyping && t < T.dumpSent
      ? reveal(DUMP, T.dumpTyping, TYPE_DUMP_MS, t)
      : '';
  const collapsed = t >= T.card;
  const thinking = (t >= T.dumpSent && t < T.questionStart) || (t >= T.answerSent && t < T.replyStart);

  return (
    <motion.div
      key="chat"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.45, ease }}
      className="absolute inset-0 flex flex-col"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_24px)]">
        {t < T.dumpSent ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <ListChecks size={24} className="mb-4 text-[#F5F5F3]" />
            <h3 className="text-xl font-medium tracking-[-0.03em] text-white sm:text-2xl">What needs your attention?</h3>
            <p className="mt-2.5 max-w-sm text-[12px] leading-5 text-white/40 sm:text-[13px]">Tell me what you need to do. Review the draft plan, then confirm to save your tasks.</p>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-end px-4 pb-4 sm:px-8">
            <div className="mx-auto w-full max-w-[600px] space-y-3">
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.div key="thread" exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease }} className="space-y-3 overflow-hidden">
                    <Bubble role="user" animate={animate}>{DUMP}</Bubble>
                    {t >= T.questionStart && (
                      <Bubble role="assistant" animate={false}>
                        {t < T.questionEnd ? <>{reveal(QUESTION, T.questionStart, STREAM_QUESTION_MS, t)}<Cursor /></> : QUESTION}
                      </Bubble>
                    )}
                    {t >= T.answerSent && <Bubble role="user" animate={animate}>{ANSWER}</Bubble>}
                    {t >= T.replyStart && (
                      <Bubble role="assistant" animate={false}>
                        {t < T.replyEnd ? <>{reveal(REPLY, T.replyStart, STREAM_REPLY_MS, t)}<Cursor /></> : REPLY}
                      </Bubble>
                    )}
                    {thinking && <Thinking />}
                  </motion.div>
                )}
              </AnimatePresence>
              {collapsed && (
                <motion.div
                  initial={animate ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35, ease }}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] px-3.5 py-2 text-[11px] text-white/45"
                >
                  Conversation · 4 messages
                  <ChevronDown size={13} />
                </motion.div>
              )}
              {collapsed && <DraftPlan confirming={t >= T.confirm} animate={animate} />}
            </div>
          </div>
        )}
      </div>
      <Composer text={composer} />
    </motion.div>
  );
}

function TaskLine({ title, minutes, category, index, animate, carried }: { title: string; minutes: number; category: string; index: number; animate: boolean; carried?: boolean }) {
  return (
    <motion.li
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: animate ? 0.2 + index * 0.05 : 0, ease }}
      className="flex items-center gap-3 py-2"
    >
      <span className="h-4 w-4 shrink-0 rounded-[5px] border border-white/25" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-white/85 sm:text-[13px]">{title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">
          <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[category] }} />{category}</span>
          <span>{minutes} min</span>
          {carried && <span className="rounded bg-white/[0.07] px-1.5 py-px text-white/55">From yesterday</span>}
        </span>
      </span>
    </motion.li>
  );
}

function TodayView({ animate }: { animate: boolean }) {
  return (
    <motion.div
      key="today"
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="absolute inset-0 overflow-hidden px-4 py-5 sm:px-8 sm:py-7"
    >
      <div className="mx-auto max-w-[600px]">
        <div className="flex items-end justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <h3 className="text-lg font-medium tracking-[-0.03em] text-white sm:text-xl">Your tasks</h3>
            <p className="mt-0.5 text-[11px] text-white/40">{PLAN.length + CARRIED.length} remaining</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] px-2.5 py-1 text-[10px] text-white/55"><Check size={11} />Plan saved</span>
        </div>
        <section aria-label="Today" className="mt-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Today</h4>
          <ol className="mt-1 divide-y divide-white/[0.05]">
            {PLAN.map((task, index) => <TaskLine key={task.title} {...task} index={index} animate={animate} />)}
          </ol>
        </section>
        <section aria-label="Carried forward" className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 pt-2.5">
          <div className="flex items-center gap-2">
            <ChevronDown size={13} className="text-white/40" />
            <h4 className="text-[12px] font-medium text-white/80">Carried forward</h4>
            <span className="rounded-full bg-white/[0.08] px-1.5 text-[10px] tabular-nums text-white/60">{CARRIED.length}</span>
            <span className="ml-auto text-[10px] text-white/30">{CARRIED.length} from yesterday</span>
          </div>
          <ol className="mt-0.5">
            {CARRIED.map((task, index) => <TaskLine key={task.title} {...task} index={PLAN.length + index} animate={animate} carried />)}
          </ol>
        </section>
      </div>
    </motion.div>
  );
}

export function ConversationDemo() {
  const reduceMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { amount: 0.35 });
  const [elapsed, setElapsed] = useState(0);
  const t = reduceMotion ? T.end : elapsed;
  const done = t >= T.end;
  const animate = !reduceMotion;

  useEffect(() => {
    if (reduceMotion || !inView || done) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const step = Math.min(now - last, 250);
      last = now;
      setElapsed((value) => Math.min(value + step, T.end));
    }, TICK);
    return () => window.clearInterval(id);
  }, [reduceMotion, inView, done]);

  const view = t >= T.today ? 'today' : 'chat';

  return (
    <div ref={root} className="relative mx-auto mt-16 w-full max-w-[920px] md:mt-20">
      <p className="sr-only">Preview: you list your tasks, Caprio asks how many hours you have, drafts a ranked plan for you to confirm, and the confirmed plan becomes your Today list.</p>
      <div className="absolute inset-x-[12%] -top-10 h-48 rounded-full bg-white/[0.08] blur-[100px]" />
      <motion.div
        aria-hidden="true"
        initial={animate ? { opacity: 0, y: 36, scale: 0.985 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.3, ease }}
        className="relative overflow-hidden rounded-[22px] border border-white/[0.12] bg-[#111111] text-left shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
      >
        <div className="flex h-11 items-center border-b border-white/[0.08] bg-white/[0.025] px-4">
          <div className="flex w-[54px] gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <div className="mx-auto flex items-center gap-0.5 rounded-full bg-white/[0.04] p-0.5 text-[10px] font-medium">
            {(['Plan', 'Today'] as const).map((tab) => (
              <span key={tab} className={`rounded-full px-3 py-1 transition-colors duration-300 ${(tab === 'Today') === (view === 'today') ? 'bg-white/[0.1] text-white/85' : 'text-white/30'}`}>{tab}</span>
            ))}
          </div>
          <span className="w-[54px]" />
        </div>
        <div className="relative h-[600px] sm:h-[640px]">
          <AnimatePresence initial={false}>
            {view === 'chat' ? <ChatView key="chat" t={t} animate={animate} /> : <TodayView key="today" animate={animate} />}
          </AnimatePresence>
        </div>
      </motion.div>
      <div className="mt-4 flex h-8 items-center justify-center">
        {done && !reduceMotion && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setElapsed(0)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-3.5 py-1.5 text-[11px] text-white/55 transition hover:border-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <RotateCcw size={12} />
            Replay
          </motion.button>
        )}
      </div>
    </div>
  );
}
