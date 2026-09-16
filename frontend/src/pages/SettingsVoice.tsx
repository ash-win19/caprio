import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Link } from 'react-router-dom';

export default function SettingsVoice() {
  return <Page>
    <PageHeader title="Shortcuts and input" parent={{ label: 'Settings', href: '/settings' }} />
    <PageBody width="form">
      <section><h2 className="mb-3 text-base font-medium">Keyboard shortcuts</h2><dl className="divide-y divide-border rounded-xl border border-border bg-card px-4"><div className="flex flex-wrap items-center justify-between gap-3 py-4"><dt className="text-sm">Open Plan</dt><dd><kbd className="text-xs">⌘ / Ctrl + Shift + Space</kbd></dd></div><div className="flex flex-wrap items-center justify-between gap-3 py-4"><dt className="text-sm">Expand or collapse the sidebar</dt><dd><kbd className="text-xs">⌘ / Ctrl + B</kbd></dd></div></dl></section>
      <section className="mt-7"><h2 className="text-base font-medium">Dictate a message</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Use the microphone in Plan to put spoken words into the message box. Edit the text before sending. The microphone appears in browsers that support speech recognition.</p><Link to="/new" className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open Plan</Link></section>
    </PageBody>
  </Page>;
}
