import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic, BarChart3, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <span className="text-lg font-semibold text-foreground">Caprio</span>
        <div className="flex items-center gap-3">
          <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link to="/signup"><Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">Get started</Button></Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-32 pb-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <span className="inline-flex items-center px-3 py-1 rounded-pill text-xs font-medium border mb-6"
            style={{ background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.2)', color: 'hsl(var(--brand))' }}>
            AI-powered prioritization
          </span>

          <h1 className="text-4xl md:text-5xl font-medium leading-[1.15] text-foreground max-w-lg">
            Your day changed.<br />Your list should too.
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-[480px]">
            Caprio listens to what happened — a blocked task, a new deadline, a low-energy afternoon — and reprioritizes your day in seconds.
          </p>

          <div className="flex items-center gap-3 mt-8">
            <Link to="/signup">
              <Button className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary/90">Start for free</Button>
            </Link>
            <Link to="/login">
              <Button variant="ghost" className="h-11 px-6">See it in action</Button>
            </Link>
          </div>

          <p className="mt-4 text-mono text-xs">⌘⇧Space to reprioritize anytime</p>
        </motion.div>
      </section>

      {/* Features */}
      <section className="border-t border-border py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: Mic, color: 'text-primary', title: 'Voice-first', desc: 'Speak what changed. Your list reshapes around it instantly.' },
            { icon: BarChart3, color: 'text-amber', title: 'Category momentum', desc: 'Track progress across every area of your life — not just work.' },
            { icon: Brain, color: 'text-cat-personal', title: 'Learns your patterns', desc: 'The more you use Caprio, the smarter your daily brief gets.' },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              className="flex flex-col gap-3"
            >
              <f.icon size={24} className={f.color} />
              <h3 className="text-subheading text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
