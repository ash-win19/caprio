import { Link } from 'react-router-dom';

export default function SettingsVoice() {
  return (
    <div className="max-w-[560px] mx-auto">
      <Link to="/settings" className="text-sm text-muted-foreground mb-4 inline-block">← Settings</Link>
      <h1 className="text-heading text-foreground mb-6">Shortcuts and input</h1>
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm">Open your daily conversation with <kbd className="rounded bg-accent px-2 py-1">⌘ / Ctrl + Shift + Space</kbd>.</p>
        <p className="text-sm text-muted-foreground">Type your tasks and changes in the conversation. Microphone recording is not available in this version.</p>
        <Link to="/new" className="inline-block text-sm underline">Open conversation</Link>
      </div>
    </div>
  );
}
