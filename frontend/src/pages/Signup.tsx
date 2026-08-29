import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth0 } from '@auth0/auth0-react';

export default function Signup() {
  const { loginWithRedirect, error, isLoading } = useAuth0();

  const handleSignup = () => {
    localStorage.removeItem('caprio_session');
    localStorage.removeItem('demo_user');
    void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <span className="text-xl font-semibold text-foreground mb-8">Caprio</span>

      <div className="w-full max-w-[380px] bg-card border border-border rounded-lg p-6">
        <h1 className="text-heading text-foreground mb-1">Create your account</h1>
        <p className="text-sm text-muted-foreground mb-6">Get started with Caprio</p>

        <p className="text-sm text-muted-foreground mb-5">
          Auth0 will open a secure sign-up page for your email and password.
        </p>

        {error && <p className="mb-4 text-sm text-cap-red">{error.message}</p>}

        <Button
          className="w-full bg-primary text-primary-foreground"
          onClick={handleSignup}
          disabled={isLoading}
        >
          Continue to sign up
        </Button>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in →</Link>
      </p>
    </div>
  );
}
