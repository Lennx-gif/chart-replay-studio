import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, TrendingUp, BarChart3, Activity } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'forgot';

const Auth = () => {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success('Password reset email sent! Check your inbox.');
        setMode('login');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Logged in successfully');
      } else {
        if (!username.trim()) {
          toast.error('Username is required');
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: username.trim() },
          },
        });
        if (error) throw error;
        toast.success('Account created! Check your email to confirm.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const headings: Record<AuthMode, { title: string; subtitle: string }> = {
    login: { title: 'Welcome back', subtitle: 'Sign in to continue your session' },
    signup: { title: 'Create account', subtitle: 'Start backtesting in minutes' },
    forgot: { title: 'Reset password', subtitle: 'We\'ll send you a reset link' },
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-card border-r border-border flex-col items-center justify-center p-12 gap-8">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold text-foreground font-mono tracking-tight">Repla</h1>
        </div>
        <p className="text-muted-foreground text-center text-lg max-w-md">
          Professional backtesting and replay simulation for forex, stocks, and commodities.
        </p>
        <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-sm">
          {[
            { icon: BarChart3, label: 'Multi-timeframe charts' },
            { icon: Activity, label: 'Simulated execution' },
            { icon: TrendingUp, label: 'Trade journal & P&L' },
            { icon: BarChart3, label: 'Drawing tools' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 rounded-md p-3">
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center lg:hidden mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingUp className="h-7 w-7 text-primary" />
              <span className="text-2xl font-bold text-foreground font-mono">Repla</span>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-foreground">{headings[mode].title}</h2>
            <p className="text-sm text-muted-foreground">{headings[mode].subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={2}
                maxLength={30}
                className="bg-card border-border"
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-card border-border"
            />
            {mode !== 'forgot' && (
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-card border-border"
              />
            )}

            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => setMode('signup')} className="text-primary hover:underline font-medium">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-primary hover:underline font-medium">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
