import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigationState } from '@/lib/dateDrafts';

// The keyboard shortcut to the Conversation: Cmd/Ctrl + Shift + Space.
export function ConversationShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        if (!useNavigationState.getState().locked) navigate('/conversation');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  return null;
}
