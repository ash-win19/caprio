import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/lib/store';

export default function Signup() {
  const navigate = useNavigate();
  const { setUser, initializeMockData } = useAppStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('caprio_session', 'demo');
    setUser({ name: 'Demo User', email: 'demo@caprio.app', categories: [] });
    initializeMockData();
    navigate('/onboarding');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <span className="text-xl font-semibold text-foreground mb-8">Caprio</span>

      <div className="w-full max-w-[380px] bg-card border border-border rounded-lg p-6">
        <h1 className="text-heading text-foreground mb-1">Create your account</h1>
        <p className="text-sm text-muted-foreground mb-6">Get started with Caprio</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Full name</Label>
            <Input className="mt-1 bg-accent border-border" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" className="mt-1 bg-accent border-border" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" className="mt-1 bg-accent border-border" />
          </div>
          <div>
            <Label>Confirm password</Label>
            <Input type="password" className="mt-1 bg-accent border-border" />
          </div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground">Create account</Button>
        </form>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in →</Link>
      </p>
    </div>
  );
}
