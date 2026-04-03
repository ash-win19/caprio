import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const PUBLIC_ROUTES = ['/', '/login', '/signup'];

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const session = localStorage.getItem('caprio_session');
    const onboarded = localStorage.getItem('onboarding_complete');
    const isPublic = PUBLIC_ROUTES.includes(location.pathname);

    if (!session && !isPublic) {
      navigate('/login', { replace: true });
    } else if (session && !onboarded && !location.pathname.startsWith('/onboarding')) {
      navigate('/onboarding', { replace: true });
    } else if (session && onboarded && (location.pathname === '/login' || location.pathname === '/signup')) {
      navigate('/today', { replace: true });
    }
  }, [location.pathname, navigate]);

  return <>{children}</>;
}
