import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_CATEGORIES } from '@/lib/types';
import { useAppStore } from '@/lib/store';

export default function Onboarding() {
  const [selected, setSelected] = useState<string[]>([]);
  const navigate = useNavigate();
  const { setUser, user } = useAppStore();

  const toggle = (name: string) => {
    setSelected((s) => s.includes(name) ? s.filter((n) => n !== name) : [...s, name]);
  };

  const handleContinue = () => {
    setUser({ ...(user || { name: 'Demo User', email: 'demo@caprio.app' }), categories: selected });
    navigate('/onboarding/prefs');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-[540px]">
        <div className="flex flex-col items-center mb-8">
          <span className="text-caption mb-2">Setting up Caprio</span>
          <div className="flex gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="w-2 h-2 rounded-full bg-border" />
          </div>
        </div>

        <h1 className="text-heading text-foreground text-center mb-2">What areas of life matter to you?</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Choose what you want to track. You can always edit these later in settings.
        </p>

        <div className="flex flex-wrap gap-2.5 justify-center mb-6">
          {DEFAULT_CATEGORIES.map((cat) => {
            const isSelected = selected.includes(cat.name);
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggle(cat.name)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors"
                style={{
                  backgroundColor: isSelected ? `${cat.color}15` : 'hsl(var(--bg-elevated))',
                  borderColor: isSelected ? `${cat.color}99` : 'hsl(var(--border))',
                  color: isSelected ? 'hsl(var(--text-primary))' : undefined,
                }}
              >
                {isSelected ? (
                  <Check size={12} style={{ color: cat.color }} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                )}
                {cat.name}
              </motion.button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-12">
          <span className="text-caption">Select at least 2 to continue</span>
          <Button
            onClick={handleContinue}
            disabled={selected.length < 2}
            className="bg-primary text-primary-foreground disabled:bg-accent disabled:text-muted-foreground"
          >
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
