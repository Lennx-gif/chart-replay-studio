import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  starting_balance: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  updateStartingBalance: (balance: number) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  updateStartingBalance: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, starting_balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      setProfile({
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        starting_balance: data.starting_balance,
      });
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) fetchProfile(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const updateStartingBalance = useCallback(async (balance: number) => {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ starting_balance: balance })
      .eq('user_id', user.id);

    if (error) throw error;
    setProfile((prev) => prev ? { ...prev, starting_balance: balance } : prev);
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, updateStartingBalance, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
