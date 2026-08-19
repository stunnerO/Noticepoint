'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/database';

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  district: string;
  neighborhood: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (data: SignUpData) => Promise<{ error: Error | null; requiresEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      if (data) {
        setProfile(data as Profile);
        return data as Profile;
      }

      // If user exists in Auth but has no profile row yet, create one from user metadata
      const { data: userData } = await supabase.auth.getUser();
      const meta = userData?.user?.user_metadata;
      if (meta) {
        const newProfile = {
          id: userId,
          full_name: meta.full_name || meta.fullName || 'Citizen',
          phone_number: meta.phone_number || meta.phoneNumber || null,
          district: meta.district || 'Adentan Municipal',
          neighborhood: meta.neighborhood || 'General',
          role: 'citizen',
        };
        const { data: inserted, error: insertError } = await supabase
          .from('profiles')
          .upsert(newProfile)
          .select()
          .single();

        if (!insertError && inserted) {
          setProfile(inserted as Profile);
          return inserted as Profile;
        }
      }

      return null;
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // 2. Auth state subscription
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user?.id) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      if (data.user) {
        await fetchProfile(data.user.id);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (data: SignUpData) => {
    try {
      const { email, password, fullName, phoneNumber, district, neighborhood } = data;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone_number: phoneNumber || '',
            district,
            neighborhood,
          },
        },
      });

      if (authError) {
        return { error: authError };
      }

      const userId = authData.user?.id;
      if (userId) {
        // Attempt to create / upsert profile row in the profiles table
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          phone_number: phoneNumber || null,
          district: district || 'Adentan Municipal',
          neighborhood: neighborhood || 'General',
          role: 'citizen',
        });

        if (profileError) {
          console.warn('Profile table insert warning (will retry on login if RLS is strict):', profileError);
        } else {
          await fetchProfile(userId);
        }
      }

      const requiresEmailConfirmation = !authData.session;
      return { error: null, requiresEmailConfirmation };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (!user?.id) {
      return { error: new Error('User is not logged in') };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: data.full_name,
          phone_number: data.phone_number,
          district: data.district,
          neighborhood: data.neighborhood,
        })
        .eq('id', user.id);

      if (error) {
        return { error };
      }

      await fetchProfile(user.id);
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
