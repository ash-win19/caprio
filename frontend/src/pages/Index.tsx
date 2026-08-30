import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDayStatus } from '@/lib/api';

export default function Index() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    
    getDayStatus(today)
      .then((status) => {
        if (status.hasTasks) {
          // User has tasks for today, go to list view
          navigate('/today', { replace: true });
        } else {
          // First open of the day, go to conversational capture
          navigate('/new', { replace: true });
        }
      })
      .catch((error) => {
        console.error('Failed to check day status:', error);
        // Default to /new on error
        navigate('/new', { replace: true });
      })
      .finally(() => {
        setIsChecking(false);
      });
  }, [navigate]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return null;
}
