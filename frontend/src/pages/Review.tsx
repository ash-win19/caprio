import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/lib/store';

type TaskAction = 'done' | 'tomorrow' | 'drop';

const ENERGY = [
  { emoji: '😴', label: 'Drained' },
  { emoji: '😐', label: 'Low' },
  { emoji: '🙂', label: 'Solid' },
  { emoji: '⚡', label: 'High' },
  { emoji: '🔥', label: 'Peak' },
];

const slideVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export default function Review() {
  const { tasks } = useAppStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [actions, setActions] = useState<Record<string, TaskAction>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [redirectTimer, setRedirectTimer] = useState<number | null>(null);

  const todayTasks = tasks.filter((t) => t.addedToday);
  const allMarked = todayTasks.every((t) => actions[t.id]);
  const doneCount = Object.values(actions).filter((a) => a === 'done').length;

  useEffect(() => {
    if (step === 3) {
      const timer = setTimeout(() => navigate('/momentum'), 3000);
      return () => clearTimeout(timer);
    }
  }, [step, navigate]);

  const markTask = (id: string, action: TaskAction) => {
    setActions((a) => ({ ...a, [id]: a[id] === action ? undefined! : action }));
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-heading text-foreground mb-1">End of day</h1>
      <p className="text-mono text-xs mb-6">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" variants={slideVariants} initial="enter" animate="center" exit="exit">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">Mark each task — no judgment.</p>
              <span className="text-mono text-[11px]">1 / 3</span>
            </div>
            <div className="space-y-2">
              {todayTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
                  <span className="text-sm text-foreground">{task.title}</span>
                  <div className="flex gap-1">
                    {[
                      { action: 'done' as TaskAction, icon: <Check size={14} />, color: 'hsl(var(--brand))' },
                      { action: 'tomorrow' as TaskAction, icon: <ArrowRight size={14} />, color: 'hsl(var(--blue))' },
                      { action: 'drop' as TaskAction, icon: <X size={14} />, color: 'hsl(var(--red))' },
                    ].map(({ action, icon, color }) => (
                      <button key={action} onClick={() => markTask(task.id, action)}
                        className="w-8 h-8 rounded-md flex items-center justify-center border transition-colors"
                        style={{
                          backgroundColor: actions[task.id] === action ? `${color}20` : 'transparent',
                          borderColor: actions[task.id] === action ? color : 'hsl(var(--border))',
                          color: actions[task.id] === action ? color : 'hsl(var(--text-muted))',
                        }}
                      >{icon}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => setStep(1)} disabled={!allMarked} className="mt-6 bg-primary text-primary-foreground">Continue →</Button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" variants={slideVariants} initial="enter" animate="center" exit="exit">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">New tasks, blockers, tomorrow's priorities.</p>
              <span className="text-mono text-[11px]">2 / 3</span>
            </div>
            <Textarea placeholder="Brain dump here — Caprio will add anything actionable to your capture pool."
              className="min-h-[120px] bg-accent border-border" />
            <div className="flex gap-3 mt-6">
              <Button onClick={() => setStep(2)} className="bg-primary text-primary-foreground">Continue →</Button>
              <button onClick={() => setStep(2)} className="text-sm text-muted-foreground hover:text-foreground">Skip</button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" variants={slideVariants} initial="enter" animate="center" exit="exit">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">This helps Caprio learn your patterns.</p>
              <span className="text-mono text-[11px]">3 / 3</span>
            </div>
            <div className="flex gap-3 justify-center mb-6">
              {ENERGY.map((e, i) => (
                <motion.button key={e.label} whileTap={{ scale: 0.95 }}
                  onClick={() => setEnergy(i)}
                  className="flex flex-col items-center gap-1 w-14 h-14 rounded-lg border justify-center transition-colors"
                  style={{
                    backgroundColor: energy === i ? 'rgba(74,222,128,0.08)' : 'hsl(var(--bg-elevated))',
                    borderColor: energy === i ? 'hsl(var(--brand))' : 'hsl(var(--border))',
                  }}
                >
                  <motion.span animate={{ scale: energy === i ? 1.2 : 1 }} className="text-lg">{e.emoji}</motion.span>
                  <span className="text-[9px] text-muted-foreground">{e.label}</span>
                </motion.button>
              ))}
            </div>
            <Button onClick={() => setStep(3)} disabled={energy === null} className="w-full bg-primary text-primary-foreground">
              Wrap up today →
            </Button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="s3" variants={slideVariants} initial="enter" animate="center" exit="exit"
            className="flex flex-col items-center text-center py-12"
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
              className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-primary" />
            </motion.div>
            <h2 className="text-2xl font-medium text-foreground">Nice work.</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You completed {doneCount} of {todayTasks.length} tasks today.
            </p>
            <div className="w-48 h-[3px] bg-accent rounded-full mt-6 overflow-hidden">
              <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 3, ease: 'linear' }}
                className="h-full bg-primary rounded-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
