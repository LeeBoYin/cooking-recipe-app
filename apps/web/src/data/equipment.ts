// 廚具（廚房有什麼器具）。權限由資料庫的 RLS 判斷，這裡只負責讀寫；同廚房的成員都能新增、修改、刪除。
// 選配手法只能是字典列出的，由資料庫檢查；手法本身由類型決定，不在這裡存。
import { newId } from '@zhusha/core';
import { supabase } from './supabase.ts';
import type { Row } from './types.ts';

export type KitchenEquipment = Row<'kitchen_equipment'>;

// 可以填的欄位（容量是原始值＋原始單位，顯示時才換算）
export type EquipmentFields = {
  equipment_type_id?: string | null; // 自訂的廚具為空，不參與推薦
  raw_name: string;
  brand?: string | null;
  model?: string | null;
  capacity_value?: number | null;
  capacity_unit?: string | null;
  enabled_optional_techniques?: string[];
  dishwasher_safe?: boolean | null;
  acquired_at?: string | null; // YYYY-MM-DD
  description?: string | null;
};

export type NewEquipment = EquipmentFields & { id?: string };
export type EquipmentPatch = Partial<EquipmentFields>;

export async function listKitchenEquipment(kitchenId: string): Promise<KitchenEquipment[]> {
  const { data, error } = await supabase()
    .from('kitchen_equipment')
    .select('*')
    .eq('kitchen_id', kitchenId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getKitchenEquipment(id: string): Promise<KitchenEquipment | null> {
  const { data, error } = await supabase().from('kitchen_equipment').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// 新增一件。id 由手機產生，重送同一個 id 不會重複新增（主鍵衝突時視為已寫入）
export async function addKitchenEquipment(kitchenId: string, item: NewEquipment): Promise<KitchenEquipment> {
  const id = item.id ?? newId();
  const { data, error } = await supabase()
    .from('kitchen_equipment')
    .insert({ ...item, id, kitchen_id: kitchenId })
    .select('*')
    .single();
  if (error?.code === '23505') {
    const existing = await getKitchenEquipment(id);
    if (existing) return existing;
  }
  if (error) throw error;
  return data;
}

export async function updateKitchenEquipment(id: string, patch: EquipmentPatch): Promise<KitchenEquipment> {
  const { data, error } = await supabase().from('kitchen_equipment').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteKitchenEquipment(id: string): Promise<void> {
  const { error } = await supabase().from('kitchen_equipment').delete().eq('id', id);
  if (error) throw error;
}
