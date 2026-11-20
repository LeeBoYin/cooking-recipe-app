// 登入狀態。M0 只有密碼登入；不開放註冊，帳號由管理員建立（M1a 起經邀請）。
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './supabase.ts';

export type SignInError = 'invalid_credentials' | 'network' | 'unknown';

export async function signIn(email: string, password: string): Promise<SignInError | null> {
  try {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (error.code === 'invalid_credentials') return 'invalid_credentials';
    if (error.status === 0 || error.name === 'AuthRetryableFetchError') return 'network';
    return 'unknown';
  } catch {
    return 'network';
  }
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

// undefined：還在讀取；null：沒有登入
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const auth = supabase().auth;
    void auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}
