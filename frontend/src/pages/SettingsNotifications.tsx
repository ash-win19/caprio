import { Link } from 'react-router-dom';
import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';

// Preserve the old preferences URL without presenting an inactive setting as a control.
export default function SettingsNotifications() {
  return <Page>
    <PageHeader title="How planning works" parent={{ label: 'Settings', href: '/settings' }} />
    <PageBody width="form">
      <h2 className="text-xl font-medium">Plan around the time you have</h2>
      <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm leading-6 text-muted-foreground"><li>Open Plan and describe your tasks, commitments, and available time.</li><li>Explicit task requests save to your selected day. Check the saved tasks and use Undo if needed.</li><li>When something changes, use Adjust plan on Today to request a revision.</li></ol>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">Suggested changes and draft plans wait for your confirmation. Saved planning-time preferences do not schedule reminders.</p>
      <Button asChild className="mt-6"><Link to="/new">Open Plan</Link></Button>
    </PageBody>
  </Page>;
}
