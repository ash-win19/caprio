import { Fragment, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUp, Check, ChevronDown, Clock3, ListChecks, Mic, RotateCcw } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;
const easeOut = [0, 0, 0.2, 1] as const;
const TICK = 33;

const DUMP = 'finish pitch deck, gym, go to library, groceries, 1 leetcode, stats pset due tonight, office hours at 3';
const QUESTION = 'Got it, seven things. How many hours do you have outside class?';
const ANSWER = 'about 6';
const REPLY = 'That works. Stats pset first since it’s due tonight, and bring your questions to office hours at 3. Pitch deck after, then gym to reset. Library, LeetCode and groceries fit this evening. Here’s a draft. Nothing is saved until you confirm.';
const AVAILABLE_MINUTES = 360;

const PLAN = [
  { title: 'Stats problem set', reason: 'Due tonight', minutes: 100, category: 'School' },
  { title: 'Office hours at 3', reason: 'Bring your pset questions', minutes: 30, category: 'School' },
  { title: 'Finish pitch deck', reason: 'Pitch is Friday', minutes: 75, category: 'Work' },
  { title: 'Gym', reason: 'Resets your focus', minutes: 45, category: 'Health' },
  { title: 'Go to library', reason: 'Return books before it closes', minutes: 15, category: 'School' },
  { title: '1 LeetCode', reason: 'Keeps internship prep going', minutes: 30, category: 'Work' },
  { title: 'Groceries', reason: 'On the way back to your dorm', minutes: 25, category: 'Personal' },
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

const TYPE_DUMP_MS = 22;
const TYPE_ANSWER_MS = 90;
const FIRST_WORD_DELAY = 180;

type Word = { text: string; at: number };

// Word-by-word reveal times with a small, repeatable variation and short
// pauses after punctuation.
function schedule(text: string, start: number): Word[] {
  let at = start + FIRST_WORD_DELAY;
  return text.split(' ').map((word, index) => {
    const item = { text: word, at };
    at += 46 + ((index * 37) % 29) + (/[.,?]$/.test(word) ? 150 : 0);
    return item;
  });
}

function buildTimeline() {
  let t = 700;
  const dumpTyping = t;
  t += DUMP.length * TYPE_DUMP_MS + 350;
  const dumpSent = t;
  t += 1000;
  const questionStart = t;
  const questionWords = schedule(QUESTION, questionStart);
  t = questionWords[questionWords.length - 1].at + 800;
  const answerTyping = t;
  t += ANSWER.length * TYPE_ANSWER_MS + 350;
  const answerSent = t;
  t += 1100;
  const replyStart = t;
  const replyWords = schedule(REPLY, replyStart);
  t = replyWords[replyWords.length - 1].at + 1100;
  const card = t;
  t += 3600;
  const confirm = t;
  t += 800;
  const today = t;
  t += 1200;
  return { dumpTyping, dumpSent, questionStart, questionWords, answerTyping, answerSent, replyStart, replyWords, card, confirm, today, end: t };
}

const T = buildTimeline();

function typed(text: string, start: number, msPerChar: number, t: number) {
  return text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - start) / msPerChar))));
}

function UserTurn({ children, animate }: { children: React.ReactNode; animate: boolean }) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="flex justify-end"
    >
      <div className="max-w-[88%] rounded-2xl bg-white/[0.08] px-3.5 py-2.5 text-[12px] leading-relaxed text-white/85 sm:text-[13px]">{children}</div>
    </motion.div>
  );
}

function StreamedWords({ words, t, animate }: { words: Word[]; t: number; animate: boolean }) {
  return (
    <>
      {words.map((word, index) => word.at <= t && (
        <Fragment key={index}>
          {index > 0 && ' '}
          <motion.span
            className="inline-block"
            initial={animate ? { opacity: 0, y: 3, filter: 'blur(4px)' } : false}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.22, ease: easeOut }}
          >
            {word.text}
          </motion.span>
        </Fragment>
      ))}
    </>
  );
}

function AssistantTurn({ t, streamStart, words, animate }: { t: number; streamStart: number; words: Word[]; animate: boolean }) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeOut }}
      className="relative min-h-10"
    >
      <AnimatePresence>
        {t < streamStart && (
          <motion.div
            key="thinking"
            initial={animate ? { opacity: 0, scale: 0.9 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25, ease: easeOut }}
            className="absolute left-0 top-0 flex origin-left items-center gap-2.5 px-1 py-2.5 text-[12px] leading-relaxed text-white/40 sm:text-[13px]"
          >
            <span className="flex items-center gap-1">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="h-1.5 w-1.5 rounded-full bg-white/50"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
                  transition={{ duration: 1, repeat: Infinity, delay: dot * 0.16, ease: 'easeInOut' }}
                />
              ))}
            </span>
            Thinking…
          </motion.div>
        )}
      </AnimatePresence>
      <p className="max-w-[88%] px-1 py-2.5 text-[12px] leading-relaxed text-white/70 sm:text-[13px]">
        <StreamedWords words={words} t={t} animate={animate} />
      </p>
    </motion.div>
  );
}

function DraftPlan({ confirming, animate }: { confirming: boolean; animate: boolean }) {
  return (
    <motion.section
      initial={animate ? { opacity: 0, y: 32 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: animate ? 0.12 : 0, ease }}
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
          <motion.span
            className="block h-full rounded-full bg-[#F5F5F3]/70"
            initial={animate ? { width: 0 } : false}
            animate={{ width: `${(plannedMinutes / AVAILABLE_MINUTES) * 100}%` }}
            transition={{ duration: 0.8, delay: animate ? 0.35 : 0, ease }}
          />
        </span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {PLAN.map((task, index) => (
          <motion.li
            key={task.title}
            initial={animate ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: animate ? 0.25 + index * 0.05 : 0, ease: easeOut }}
            className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-1 sm:py-2"
          >
            <span className="font-mono text-[9px] text-white/25">0{index + 1}</span>
            <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
              <span className="block truncate text-[12px] font-medium text-white/85 sm:shrink-0">{task.title}</span>
              <span className="block truncate text-[10px] text-white/40 sm:text-[11px]">{task.reason}</span>
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
  const field = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (field.current) field.current.scrollLeft = field.current.scrollWidth;
  }, [text]);

  return (
    <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.06] bg-[#111111] px-4 pb-4 pt-3 sm:px-8">
      <div className="mx-auto flex max-w-[720px] items-end gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.035] py-2 pl-3.5 pr-2">
        <span ref={field} className={`min-w-0 flex-1 break-words py-1 text-[12px] leading-5 sm:overflow-hidden sm:whitespace-nowrap sm:text-[13px] ${text ? 'text-white/85' : 'text-white/25'}`}>
          {text || 'Tell me what you need to do…'}
          {text && <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-white/70" />}
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center text-white/40"><Mic size={14} /></span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-300 ${text ? 'bg-[#F5F5F3] text-[#090909]' : 'bg-white/[0.08] text-white/30'}`}><ArrowUp size={14} /></span>
      </div>
    </div>
  );
}

// Keeps the newest content in view by easing the thread upward every frame,
// so growing replies, the plan card, and the collapse never jump.
function useFollowBottom(viewport: React.RefObject<HTMLDivElement>, content: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    if (typeof window.requestAnimationFrame !== 'function') return;
    let offset = 0;
    let frame = 0;
    const step = () => {
      const view = viewport.current;
      const inner = content.current;
      if (view && inner) {
        const target = Math.max(0, inner.offsetHeight - view.clientHeight);
        offset += (target - offset) * 0.14;
        if (Math.abs(target - offset) < 0.3) offset = target;
        inner.style.transform = `translate3d(0, ${-offset}px, 0)`;
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [viewport, content]);
}

function ChatView({ t, animate }: { t: number; animate: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useFollowBottom(viewport, content);

  const composer = t >= T.answerTyping && t < T.answerSent
    ? typed(ANSWER, T.answerTyping, TYPE_ANSWER_MS, t)
    : t >= T.dumpTyping && t < T.dumpSent
      ? typed(DUMP, T.dumpTyping, TYPE_DUMP_MS, t)
      : '';
  const collapsed = t >= T.card;

  return (
    <motion.div
      key="chat"
      initial={animate ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="absolute inset-0"
    >
      <div ref={viewport} className="absolute inset-x-0 bottom-[72px] top-0 overflow-hidden px-4 [mask-image:linear-gradient(to_bottom,transparent,black_24px)] sm:px-8">
        <AnimatePresence>
          {t < T.dumpSent && (
            <motion.div
              key="empty"
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
            >
              <ListChecks size={24} className="mb-4 text-[#F5F5F3]" />
              <h3 className="text-xl font-medium tracking-[-0.03em] text-white sm:text-2xl">What needs your attention?</h3>
              <p className="mt-2.5 max-w-sm text-[12px] leading-5 text-white/40 sm:text-[13px]">Tell me what you need to do. Review the draft plan, then confirm to save your tasks.</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={content} className="mx-auto max-w-[720px] space-y-3 py-4 will-change-transform">
          {t >= T.dumpSent && (
            <motion.div
              initial={{ height: 'auto' }}
              animate={{ height: collapsed ? 38 : 'auto' }}
              transition={{ duration: 0.65, delay: collapsed && animate ? 0.08 : 0, ease }}
              className={`relative ${collapsed ? 'overflow-hidden' : ''}`}
            >
              <motion.div initial={{ opacity: 1 }} animate={{ opacity: collapsed ? 0 : 1 }} transition={{ duration: 0.2, ease: easeOut }} className="space-y-3">
                <UserTurn animate={animate}>{DUMP}</UserTurn>
                <AssistantTurn t={t} streamStart={T.questionStart} words={T.questionWords} animate={animate} />
                {t >= T.answerSent && <UserTurn animate={animate}>{ANSWER}</UserTurn>}
                {t >= T.answerSent && <AssistantTurn t={t} streamStart={T.replyStart} words={T.replyWords} animate={animate} />}
              </motion.div>
              <AnimatePresence>
                {collapsed && (
                  <motion.div
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: animate ? 0.2 : 0, ease: easeOut }}
                    className="absolute inset-x-0 top-0 flex h-[38px] items-center justify-between rounded-xl border border-white/[0.08] px-3.5 text-[11px] text-white/45"
                  >
                    Conversation · 4 messages
                    <ChevronDown size={13} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
          {collapsed && <DraftPlan confirming={t >= T.confirm} animate={animate} />}
        </div>
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
      transition={{ duration: 0.35, delay: animate ? 0.2 + index * 0.05 : 0, ease: easeOut }}
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
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easeOut }}
      className="absolute inset-0 overflow-hidden px-4 py-5 sm:px-8 sm:py-7"
    >
      <div className="mx-auto max-w-[720px]">
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
      <p className="sr-only">Preview: a student lists the day’s tasks, Caprio asks how many hours they have outside class, drafts a ranked plan to confirm, and the confirmed plan becomes the Today list.</p>
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
        <div className="relative h-[650px] sm:h-[660px]">
          <AnimatePresence>
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
