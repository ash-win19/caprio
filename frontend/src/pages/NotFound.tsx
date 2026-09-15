import { Link } from 'react-router-dom';
import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <Page>
    <PageHeader title="Page not found" actions={<Button asChild variant="outline"><Link to="/today">Back to today</Link></Button>} />
    <PageBody><p className="text-muted-foreground">This page doesn't exist. Choose a page in the sidebar or return to today.</p></PageBody>
  </Page>;
}
