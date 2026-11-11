import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { clearActiveAccount } from '@/lib/accountSession';
import { useAppStore } from '@/lib/store';

// Signs out of Auth0, or ends the local demo session and returns to sign-in.
export function useSignOut() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth0();
  return () => {
    const { setUser, resetAccountState } = useAppStore.getState();
    const isDemo = localStorage.getItem('caprio_session') === 'demo';

    localStorage.removeItem('caprio_session');
    localStorage.removeItem('demo_user');
    setUser(null);

    if (isAuthenticated && !isDemo) {
      void logout({ logoutParams: { returnTo: window.location.origin } });
      return;
    }

    resetAccountState();
    clearActiveAccount();
    localStorage.removeItem('caprio-store');
    navigate('/login');
  };
}
