import { PublicHeader } from '@/components/PublicHeader';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { completeOnboarding } from '@/lib/api';
import { DEFAULT_CATEGORIES } from '@/lib/types';
import { invalidatePlanningQueries } from '@/lib/queries';

export default function OnboardingPrefs() {
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
      await completeOnboarding({ proactiveReprioritization: false }, selectedCategories);
      await invalidatePlanningQueries(client);
      navigate('/new');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 pb-10 pt-24 bg-background">
      <PublicHeader step="Setup · 2 of 2" back={{ href: '/onboarding', label: 'Back' }} />
      <div className="w-full max-w-[460px]">
        <h1 className="text-heading text-foreground mb-3">Make room for your day</h1>
        <p className="text-sm text-muted-foreground mb-8">Tell Caprio what needs doing and how much time you have. Review its suggestions before they become your plan.</p>
        <div className="mb-6"><h2 className="mb-3 text-sm font-medium">Your categories</h2><div className="flex flex-wrap gap-2">{user?.categories.map(name => <span key={name} className="rounded-md border border-border bg-card px-3 py-2 text-sm">{name}</span>)}</div><p className="mt-3 text-xs text-muted-foreground">You can change these in Settings anytime.</p></div>
        {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}
        <Button onClick={handleStart} disabled={saving} className="w-full">{saving ? 'Saving...' : 'Plan my day'}</Button>
      </div>
    </div>
  );
}
