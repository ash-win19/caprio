import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useAppStore } from '@/lib/store';

export default function SettingsVoice() {
  const { prefs, setPrefs, voiceEntries, removeVoiceEntry, clearVoiceEntries } = useAppStore();
  const [local, setLocal] = useState(prefs);

  return (
    <div className="max-w-[560px] mx-auto">
      <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Settings</Link>
      <h1 className="text-heading text-foreground mb-6">Voice & shortcuts</h1>

      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <label className="text-sm font-medium text-foreground block mb-2">Activation shortcut</label>
          <div className="flex gap-1">
            {['⌘', '⇧', 'Space'].map((k) => (
              <span key={k} className="px-2 py-1 bg-accent border border-border rounded text-mono text-xs">{k}</span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Click to change</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <label className="text-sm font-medium text-foreground block mb-3">Input sensitivity</label>
          <Slider value={[local.micSensitivity]} onValueChange={([v]) => setLocal({ ...local, micSensitivity: v })}
            max={100} step={1} className="w-full" />
          <div className="flex justify-between mt-1">
            <span className="text-caption">Low</span>
            <span className="text-caption">High</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <label className="text-sm font-medium text-foreground block mb-2">Language</label>
          <select value={local.language} onChange={(e) => setLocal({ ...local, language: e.target.value })}
            className="bg-accent border border-border rounded-md px-3 py-1.5 text-sm text-foreground">
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Save voice transcripts</p>
            <p className="text-xs text-muted-foreground mt-1">Transcripts are stored locally and never shared.</p>
          </div>
          <Switch checked={local.saveTranscripts}
            onCheckedChange={(v) => setLocal({ ...local, saveTranscripts: v })} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-caption uppercase tracking-wider">Recent voice inputs</p>
            <button onClick={clearVoiceEntries} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
          </div>
          <div className="space-y-2">
            {voiceEntries.map((e) => (
              <div key={e.id} className="group bg-accent border border-border rounded-lg px-4 py-3 flex items-center gap-3">
                <p className="text-xs text-muted-foreground flex-1 line-clamp-2">{e.transcript}</p>
                <span className="text-mono text-[11px] flex-shrink-0">{e.timestamp}</span>
                <button onClick={() => removeVoiceEntry(e.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-cap-red transition-opacity">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <Button onClick={() => setPrefs(local)} className="bg-primary text-primary-foreground">Save</Button>
      </div>
    </div>
  );
}
