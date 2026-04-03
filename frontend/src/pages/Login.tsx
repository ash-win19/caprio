import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setUser, initializeMockData } = useAppStore();

  const handleDemo = () => {
    localStorage.setItem('caprio_session', 'demo');
    localStorage.setItem('demo_user', 'true');
    setUser({ name: 'Demo User', email: 'demo@caprio.app', categories: ['Work', 'Gym', 'Personal Growth', 'Finance'] });
    initializeMockData();
    const onboarded = localStorage.getItem('onboarding_complete');
    navigate(onboarded ? '/today' : '/onboarding');
  };

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    handleDemo();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <span className="text-xl font-semibold text-foreground mb-8">Caprio</span>

      <div className="w-full max-w-[380px] bg-card border border-border rounded-lg p-6">
        <h1 className="text-heading text-foreground mb-1">Welcome back</h1>
        <p className="text-sm text-muted-foreground mb-6">Sign in to your account</p>

        <Button variant="outline" className="w-full mb-4 gap-2 bg-accent border-border">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <Label className="text-sm text-foreground">Email</Label>
            <Input className="mt-1 bg-accent border-border" />
          </div>
          <div>
            <Label className="text-sm text-foreground">Password</Label>
            <div className="relative mt-1">
              <Input type={showPassword ? 'text' : 'password'} className="bg-accent border-border pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground">Sign in</Button>
        </form>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Just exploring? <button onClick={handleDemo} className="text-primary hover:underline">Continue as demo user →</button>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        No account? <Link to="/signup" className="text-primary hover:underline">Sign up →</Link>
      </p>
    </div>
  );
}
