// 廚房與成員。加入、離開、改角色只經資料庫函式（M2 起）；這裡是 M0 用得到的部分。
import { currentUserId } from './account.ts';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type Kitchen = Row<'kitchens'>;
export type KitchenMember = Row<'kitchen_members'>;
export type MyKitchen = Kitchen & { role: KitchenMember['role']; membership_id: string };

export type KitchenPatch = Partial<Pick<Kitchen, 'name' | 'timezone' | 'region'>>;
export type MembershipPatch = Partial<
  Pick<KitchenMember, 'share_dietary_info' | 'expiry_alerts' | 'default_diners_all'>
>;

// 我現在所在的所有廚房（含我的角色）
export async function listMyKitchens(): Promise<MyKitchen[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase()
    .from('kitchen_members')
    .select('id, role, kitchen:kitchens!inner(*)')
    .eq('user_id', userId)
    .is('left_at', null)
    .is('kitchen.deleted_at', null)
    .order('joined_at');
  if (error) throw error;
  return data.map(({ id, role, kitchen }) => ({ ...kitchen, role, membership_id: id }));
}

// 廚房的成員名單（含前成員，顯示「誰加的」時用）
export async function listKitchenMembers(kitchenId: string): Promise<KitchenMember[]> {
  const { data, error } = await supabase()
    .from('kitchen_members')
    .select('*')
    .eq('kitchen_id', kitchenId)
    .order('joined_at');
  if (error) throw error;
  return data;
}

// 管理者改廚房名稱、時區、地區
export async function updateKitchen(kitchenId: string, patch: KitchenPatch): Promise<Kitchen> {
  const { data, error } = await supabase()
    .from('kitchens')
    .update(patch)
    .eq('id', kitchenId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// 本人改自己在這個廚房的提醒與分享設定
export async function updateMyMembership(membershipId: string, patch: MembershipPatch): Promise<KitchenMember> {
  const { data, error } = await supabase()
    .from('kitchen_members')
    .update(patch)
    .eq('id', membershipId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setCurrentKitchen(kitchenId: string): Promise<void> {
  const { error } = await supabase().rpc('set_current_kitchen', { p_kitchen_id: kitchenId });
  if (error) throw error;
}
