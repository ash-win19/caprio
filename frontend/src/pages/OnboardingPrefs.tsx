import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { completeOnboarding } from '@/lib/api';
import { DEFAULT_CATEGORIES } from '@/lib/types';
import { invalidatePlanningQueries } from '@/lib/queries';

export default function OnboardingPrefs() {
  const [briefTime, setBriefTime] = useState('08:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user, categories } = useAppStore();

  const handleStart = async () => {
    setSaving(true);
    setError('');
    try {
      const selectedCategories = (categories.length ? categories : DEFAULT_CATEGORIES).filter(category => user?.categories.includes(category.name));
      await completeOnboarding({ briefTime, proactiveReprioritization: false }, selectedCategories);
      await invalidatePlanningQueries(client);
      navigate('/new');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-[460px]">
        <p className="text-caption mb-4">Setting up Caprio · 2 of 2</p>
        <h1 className="text-heading text-foreground mb-3">Make room for your day</h1>
        <p className="text-sm text-muted-foreground mb-8">Tell Caprio what needs doing and how much time you have. Review its suggestions before they become your plan.</p>
        <label className="block text-sm text-foreground mb-2" htmlFor="brief-time">When do you usually plan your day?</label>
        <input id="brief-time" type="time" value={briefTime} onChange={event => setBriefTime(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 mb-3 text-foreground" />
        <p className="text-xs text-muted-foreground mb-8">This saves your preference. Automatic reminders are not part of this version.</p>
        {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}
        <Button onClick={handleStart} disabled={saving || !briefTime} className="w-full">{saving ? 'Saving...' : 'Plan my day'}</Button>
      </div>
    </div>
  );
}
