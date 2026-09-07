import { useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function VoiceWidget() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        navigate('/new');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  return <button type="button" onClick={() => navigate('/new')} className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-accent md:bottom-6 md:right-6" title="Plan my day (⌘/Ctrl + Shift + Space)"><MessageSquare size={17} className="text-primary" /><span>Plan my day</span></button>;
}
