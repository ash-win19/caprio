import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';

const TIMES = ['6 AM', '7 AM', '8 AM', '9 AM', 'Custom'];
const FREQUENCIES = [
  { id: 'light', title: 'Morning only', desc: 'One daily brief, no interruptions during the day' },
  { id: 'regular', title: 'Morning + mid-day', desc: 'A brief check-in around noon if your tasks shift' },
  { id: 'focused', title: 'Morning only, minimal mode', desc: 'AI suggestions only when you explicitly ask' },
] as const;

export default function OnboardingPrefs() {
  const [selectedTime, setSelectedTime] = useState('8 AM');
  const [frequency, setFrequency] = useState<string>('regular');
  const navigate = useNavigate();
  const { setPrefs, initializeMockData } = useAppStore();

  const handleStart = () => {
    setPrefs({ nudgeFrequency: frequency as any, briefTime: selectedTime });
    localStorage.setItem('onboarding_complete', 'true');
    initializeMockData();
    navigate('/today');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-[540px]">
        <div className="flex flex-col items-center mb-8">
          <span className="text-caption mb-2">Setting up Caprio</span>
          <div className="flex gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>

        <h1 className="text-heading text-foreground text-center mb-2">Customize your daily brief</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Caprio prepares your prioritized list each morning. Tell it when and how.
        </p>

        <div className="mb-8">
          <label className="text-sm font-medium text-foreground mb-3 block">When should your day be ready?</label>
          <div className="flex flex-wrap gap-2">
            {TIMES.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTime(t)}
                className="px-4 py-2 rounded-md text-sm border transition-colors"
                style={{
                  backgroundColor: selectedTime === t ? 'rgba(74,222,128,0.08)' : 'hsl(var(--bg-elevated))',
                  borderColor: selectedTime === t ? 'hsl(var(--brand))' : 'hsl(var(--border))',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8">
          <label className="text-sm font-medium text-foreground mb-3 block">How often should Caprio check in?</label>
          <div className="space-y-3">
            {FREQUENCIES.map((f) => (
              <button
                key={f.id}
                onClick={() => setFrequency(f.id)}
                className="w-full text-left p-4 rounded-lg border transition-colors"
                style={{
                  backgroundColor: frequency === f.id ? 'rgba(74,222,128,0.05)' : 'hsl(var(--bg-elevated))',
                  borderColor: frequency === f.id ? 'hsl(var(--brand))' : 'hsl(var(--border))',
                }}
              >
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handleStart} className="w-full bg-primary text-primary-foreground">
          Start using Caprio →
        </Button>
      </div>
    </div>
  );
}
