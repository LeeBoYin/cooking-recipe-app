// 帳號：個人設定與暱稱。權限由資料庫的 RLS 判斷，這裡只負責讀寫。
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type UserSettings = Row<'user_settings'>;
export type UserIdentity = Row<'user_identities'>;

// App 可以直接改的設定欄位（目前所在的廚房經 setCurrentKitchen 切換）
export type UserSettingsPatch = Partial<
  Pick<
    UserSettings,
    | 'locale'
    | 'chef_persona'
    | 'household_size'
    | 'temperature_unit'
    | 'measure_unit'
    | 'expiring_alert'
    | 'alert_time'
    | 'weekend_inspiration'
    | 'sound'
    | 'haptics'
    | 'analytics_opt_out'
    | 'onboarding_completed_steps'
    | 'onboarding_completed_at'
    | 'seen_hints'
  >
>;

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('not_signed_in');
  return data.user.id;
}

export async function getMySettings(): Promise<UserSettings> {
  const userId = await currentUserId();
  const { data, error } = await supabase().from('user_settings').select('*').eq('user_id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateMySettings(patch: UserSettingsPatch): Promise<UserSettings> {
  const userId = await currentUserId();
  const { data, error } = await supabase()
    .from('user_settings')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getMyIdentity(): Promise<UserIdentity> {
  const userId = await currentUserId();
  const { data, error } = await supabase().from('user_identities').select('*').eq('user_id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateDisplayName(displayName: string): Promise<UserIdentity> {
  const userId = await currentUserId();
  const { data, error } = await supabase()
    .from('user_identities')
    .update({ display_name: displayName.trim() })
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// 看得到的人的暱稱（自己、同廚房的人）
export async function getIdentities(userIds: string[]): Promise<UserIdentity[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase().from('user_identities').select('*').in('user_id', userIds);
  if (error) throw error;
  return data;
}
