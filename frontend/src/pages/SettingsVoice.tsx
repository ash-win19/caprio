import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Link } from 'react-router-dom';

export default function SettingsVoice() {
  return (
    <Page>
      <PageHeader title="Shortcuts and input" parent={{ label: 'Settings', href: '/settings' }} />
      <PageBody width="form">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm">Open your daily conversation with <kbd className="rounded bg-accent px-2 py-1">⌘ / Ctrl + Shift + Space</kbd>.</p>
        <p className="text-sm text-muted-foreground">On Plan, use the mic in the composer when your browser supports speech recognition. Transcripts go into the message box — there is no separate voice product.</p>
        <Link to="/new" className="inline-block text-sm underline">Open conversation</Link>
      </div>
      </PageBody>
    </Page>
  );
}
