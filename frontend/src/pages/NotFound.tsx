import { Link } from 'react-router-dom';
import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { openTodayState } from '@/lib/dayEntry';
import { useLocalDay } from '@/lib/useLocalDay';

export default function NotFound() {
  const today = useLocalDay();
  return <Page>
    <PageHeader title="Page not found" actions={<Button asChild variant="outline"><Link to="/today" state={openTodayState(today)}>Back to Today</Link></Button>} />
    <PageBody><p className="text-muted-foreground">This page doesn't exist. Choose Today or History above.</p></PageBody>
  </Page>;
}
