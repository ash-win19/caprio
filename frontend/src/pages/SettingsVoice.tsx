import { Link } from 'react-router-dom';

export default function SettingsVoice() {
  return (
    <div className="max-w-[560px] mx-auto">
      <Link to="/settings" className="text-sm text-muted-foreground mb-4 inline-block">← Settings</Link>
      <h1 className="text-heading text-foreground mb-6">Shortcuts and input</h1>
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm">Open your daily conversation with <kbd className="rounded bg-accent px-2 py-1">⌘ / Ctrl + Shift + Space</kbd>.</p>
        <p className="text-sm text-muted-foreground">On Plan, use the mic in the composer when your browser supports speech recognition. Transcripts go into the message box — there is no separate voice product.</p>
        <Link to="/new" className="inline-block text-sm underline">Open conversation</Link>
      </div>
    </div>
  );
}
