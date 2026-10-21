import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getProfile, updateProfile, type UserProfile } from '@/lib/db/localDatabase';

interface ProfileContextType {
  profile: UserProfile;
  loading: boolean;
  updateStartingBalance: (balance: number) => Promise<void>;
  updateUserProfile: (partial: Partial<UserProfile>) => Promise<void>;
  // Backwards compatibility helpers
  user: { email: string; id: string } | null;
  signOut: () => Promise<void>;
}

const DEFAULT_PROFILE: UserProfile = {
  id: 'current',
  displayName: 'Local Trader',
  startingBalance: 10000,
  riskPercentage: 1,
  currency: 'USD',
  favoriteTools: ['trendline', 'horizontal', 'fibonacci', 'position_long', 'position_short', 'measure'],
  theme: 'dark',
};

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_PROFILE,
  loading: true,
  updateStartingBalance: async () => {},
  updateUserProfile: async () => {},
  user: { email: 'local@machine', id: 'local-user' },
  signOut: async () => {},
});

export const useProfile = () => useContext(ProfileContext);
// Alias for backwards compatibility
export const useAuth = () => useContext(ProfileContext);

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const [profile, setProfileState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getProfile()
      .then((p) => {
        if (mounted) {
          setProfileState(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateStartingBalance = useCallback(async (balance: number) => {
    const updated = await updateProfile({ startingBalance: balance });
    setProfileState(updated);
  }, []);

  const updateUserProfile = useCallback(async (partial: Partial<UserProfile>) => {
    const updated = await updateProfile(partial);
    setProfileState(updated);
  }, []);

  const signOut = useCallback(async () => {
    // Local offline mode doesn't sign out, but resets to default profile if requested
    const reset = await updateProfile(DEFAULT_PROFILE);
    setProfileState(reset);
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        updateStartingBalance,
        updateUserProfile,
        user: { email: `${profile.displayName.toLowerCase().replace(/\s+/g, '_')}@offline`, id: 'local-user' },
        signOut,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};
