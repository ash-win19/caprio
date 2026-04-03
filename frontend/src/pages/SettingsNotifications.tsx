import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/lib/store';

export default function SettingsNotifications() {
  const { prefs, setPrefs } = useAppStore();
  const [local, setLocal] = useState(prefs);

  return (
    <div className="max-w-[560px] mx-auto">
      <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Settings</Link>
      <h1 className="text-heading text-foreground mb-6">Notifications</h1>

      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <label className="text-sm font-medium text-foreground block mb-2">When should your day be ready?</label>
          <input type="time" value={local.briefTime}
            onChange={(e) => setLocal({ ...local, briefTime: e.target.value })}
            className="bg-accent border border-border rounded-md px-3 py-1.5 text-sm font-mono text-foreground" />
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <label className="text-sm font-medium text-foreground block mb-3">Mid-day check-ins</label>
          <div className="flex bg-accent rounded-lg p-1">
            {(['light', 'regular', 'focused'] as const).map((f) => (
              <button key={f} onClick={() => setLocal({ ...local, nudgeFrequency: f })}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                  local.nudgeFrequency === f ? 'bg-card border border-border shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              >{f}</button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Proactive reprioritization</p>
            <p className="text-xs text-muted-foreground mt-1">Let Caprio suggest reorders based on your patterns</p>
          </div>
          <Switch checked={local.proactiveReprioritization}
            onCheckedChange={(v) => setLocal({ ...local, proactiveReprioritization: v })} />
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">End-of-day reminder</p>
            <p className="text-xs text-muted-foreground mt-1">Remind me to review my day</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={local.eodReminder}
              onCheckedChange={(v) => setLocal({ ...local, eodReminder: v })} />
            {local.eodReminder && (
              <input type="time" value={local.eodTime}
                onChange={(e) => setLocal({ ...local, eodTime: e.target.value })}
                className="bg-accent border border-border rounded-md px-2 py-1 text-xs font-mono text-foreground" />
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <Button onClick={() => setPrefs(local)} className="bg-primary text-primary-foreground">Save</Button>
      </div>
    </div>
  );
}
