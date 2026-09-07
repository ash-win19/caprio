import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { updateSettings } from '@/lib/api';
import { invalidatePlanningQueries } from '@/lib/queries';

export default function SettingsNotifications() {
  const { prefs } = useAppStore();
  const [briefTime, setBriefTime] = useState(/^\d{2}:\d{2}$/.test(prefs.briefTime) ? prefs.briefTime : '08:00');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const client = useQueryClient();
  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      await updateSettings({ briefTime, proactiveReprioritization: false });
      await invalidatePlanningQueries(client);
      setStatus('Preferences saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save preferences.');
    } finally { setSaving(false); }
  };
  return (
    <div className="max-w-[560px] mx-auto">
      <Link to="/settings" className="text-sm text-muted-foreground mb-4 inline-block">← Settings</Link>
      <h1 className="text-heading text-foreground mb-6">Planning preferences</h1>
      <div className="bg-card border border-border rounded-lg p-4">
        <label htmlFor="planning-time" className="text-sm block mb-3">When do you usually plan your day?</label>
        <input id="planning-time" type="time" value={briefTime} onChange={event => setBriefTime(event.target.value)} className="bg-accent border border-border rounded-md px-3 py-2 text-sm" />
        <p className="text-sm text-muted-foreground mt-4">Caprio proposes changes when you describe a change in your day. You review and confirm them before your plan changes.</p>
        <p className="text-sm text-muted-foreground mt-3">Automatic reminders and check-ins are not available in this version.</p>
      </div>
      <p role="status" className="text-sm mt-4">{status}</p>
      <Button onClick={save} disabled={saving || !briefTime} className="mt-4">{saving ? 'Saving...' : 'Save preferences'}</Button>
    </div>
  );
}
