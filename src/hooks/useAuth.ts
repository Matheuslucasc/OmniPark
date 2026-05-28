import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export type AuthStatus = 'loading' | 'unauthenticated' | 'pending_approval' | 'approved';

export interface AuthState {
  user: User | null;
  status: AuthStatus;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const checkApproval = async (u: User) => {
    if (!supabase) { setStatus('approved'); return; }

    const { data, error } = await supabase
      .from('profiles')
      .select('approved')
      .eq('id', u.id)
      .single();

    if (error) {
      console.error('[OmniPark] Erro ao checar perfil:', error.message, error.code);

      // Perfil não existe — cria com approved=false e aguarda aprovação
      if (error.code === 'PGRST116') {
        await supabase.from('profiles').upsert({
          id:       u.id,
          email:    u.email,
          name:     u.user_metadata?.name ?? u.email?.split('@')[0] ?? '',
          approved: false,
        }, { onConflict: 'id' });
        setStatus('pending_approval');
        return;
      }
    }

    setStatus(data?.approved ? 'approved' : 'pending_approval');
  };

  useEffect(() => {
    if (!supabase) { setStatus('approved'); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        checkApproval(session.user);
      } else {
        setStatus('unauthenticated');
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        checkApproval(session.user);
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return null;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  };

  const signUp = async (email: string, password: string, name: string): Promise<string | null> => {
    if (!supabase) return null;
    // Passa o nome nos metadados — o trigger handle_new_user() usa raw_user_meta_data->>'name'
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return error.message;
    // O perfil é criado automaticamente pelo trigger no banco (handle_new_user)
    return null;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return { user, status, signIn, signUp, signOut };
}
