// TanStack Query 的讀取。資料一律即時向雲端讀取，不做離線快取（04 ADR-02）。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { newId } from '@zhusha/core';
import { processPhoto } from '../photos/process.ts';
import {
  enqueueEquipmentPhoto,
  flushPendingPhotos,
  getUploadState,
  onPhotoCommitted,
  subscribeUploads,
} from '../photos/uploadQueue.ts';
import { deletePhoto, listEquipmentPhotos, signPhotoUrls, type Photo } from './photos.ts';
import { getMyIdentity, getMySettings } from './account.ts';
import { listMyKitchens, setCurrentKitchen } from './kitchens.ts';
import {
  addPantryItems,
  listPantryItems,
  listRecentAdditions,
  listRecentlyRemoved,
  removePantryItem,
  restorePantryItem,
  updatePantryItem,
  type NewPantryItem,
  type PantryItemPatch,
} from './pantry.ts';
import {
  addKitchenEquipment,
  deleteKitchenEquipment,
  getKitchenEquipment,
  listKitchenEquipment,
  updateKitchenEquipment,
  type EquipmentPatch,
  type NewEquipment,
} from './equipment.ts';

export const queryKeys = {
  settings: ['me', 'settings'] as const,
  identity: ['me', 'identity'] as const,
  kitchens: ['me', 'kitchens'] as const,
  pantry: (kitchenId: string) => ['kitchen', kitchenId, 'pantry'] as const,
  pantryAdditions: (kitchenId: string) => ['kitchen', kitchenId, 'pantry-additions'] as const,
  pantryRemoved: (kitchenId: string) => ['kitchen', kitchenId, 'pantry', 'removed'] as const,
  equipment: (kitchenId: string) => ['kitchen', kitchenId, 'equipment'] as const,
  equipmentItem: (kitchenId: string, id: string) => ['kitchen', kitchenId, 'equipment', id] as const,
  equipmentPhotos: (kitchenId: string) => ['kitchen', kitchenId, 'photos', 'equipment'] as const,
  photoUrls: (paths: string[]) => ['photo-urls', ...paths] as const,
};

export function useMySettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: getMySettings });
}

export function useMyIdentity() {
  return useQuery({ queryKey: queryKeys.identity, queryFn: getMyIdentity });
}

export function useMyKitchens() {
  return useQuery({ queryKey: queryKeys.kitchens, queryFn: listMyKitchens });
}

// 切換目前所在的廚房。食材、廚具都跟著換，所以把所有讀取標成過期重讀
export function useSetCurrentKitchen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kitchenId: string) => setCurrentKitchen(kitchenId),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// 目前所在的廚房
export function useCurrentKitchen() {
  const settings = useMySettings();
  const kitchens = useMyKitchens();
  const kitchen = kitchens.data?.find((k) => k.id === settings.data?.current_kitchen_id) ?? kitchens.data?.[0];
  return {
    kitchen,
    isPending: settings.isPending || kitchens.isPending,
    error: settings.error ?? kitchens.error,
  };
}

// 廚房現在有的食材；沒有廚房 ID 時不查
export function usePantryItems(kitchenId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pantry(kitchenId ?? ''),
    queryFn: () => listPantryItems(kitchenId as string),
    enabled: !!kitchenId,
  });
}

// 最近移除（可復原）
export function useRecentlyRemovedPantry(kitchenId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pantryRemoved(kitchenId ?? ''),
    queryFn: () => listRecentlyRemoved(kitchenId as string),
    enabled: !!kitchenId,
  });
}

// 過去 30 天加入過的食材 ID，給常買清單排序
export function usePantryAdditions(kitchenId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pantryAdditions(kitchenId ?? ''),
    queryFn: () => listRecentAdditions(kitchenId as string),
    enabled: !!kitchenId,
  });
}

// 食材的寫入。成功後把這個廚房的食材（含最近移除、常買清單）全部標成過期重讀
function usePantryMutation<TVars, TResult>(kitchenId: string | undefined, fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen', kitchenId ?? ''] }),
  });
}

export function useAddPantryItems(kitchenId: string | undefined) {
  return usePantryMutation(kitchenId, (items: NewPantryItem[]) => addPantryItems(kitchenId as string, items));
}
export function useRemovePantryItem(kitchenId: string | undefined) {
  return usePantryMutation(kitchenId, (id: string) => removePantryItem(id));
}
export function useRestorePantryItem(kitchenId: string | undefined) {
  return usePantryMutation(kitchenId, (id: string) => restorePantryItem(id));
}
export function useUpdatePantryItem(kitchenId: string | undefined) {
  return usePantryMutation(kitchenId, (v: { id: string; patch: PantryItemPatch }) => updatePantryItem(v.id, v.patch));
}

// 廚房的廚具；沒有廚房 ID 時不查
export function useKitchenEquipment(kitchenId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.equipment(kitchenId ?? ''),
    queryFn: () => listKitchenEquipment(kitchenId as string),
    enabled: !!kitchenId,
  });
}

export function useKitchenEquipmentItem(kitchenId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.equipmentItem(kitchenId ?? '', id ?? ''),
    queryFn: () => getKitchenEquipment(id as string),
    enabled: !!kitchenId && !!id,
  });
}

// 廚具的寫入。成功後把這個廚房的廚具標成過期重讀
function useEquipmentMutation<TVars, TResult>(kitchenId: string | undefined, fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.equipment(kitchenId ?? '') }),
  });
}

export function useAddKitchenEquipment(kitchenId: string | undefined) {
  return useEquipmentMutation(kitchenId, (item: NewEquipment) => addKitchenEquipment(kitchenId as string, item));
}
export function useUpdateKitchenEquipment(kitchenId: string | undefined) {
  return useEquipmentMutation(kitchenId, (v: { id: string; patch: EquipmentPatch }) => updateKitchenEquipment(v.id, v.patch));
}
export function useDeleteKitchenEquipment(kitchenId: string | undefined) {
  return useEquipmentMutation(kitchenId, (id: string) => deleteKitchenEquipment(id));
}

// 廚具照片（一件一張）：回傳「廚具 ID → 照片」
export function useEquipmentPhotos(kitchenId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.equipmentPhotos(kitchenId ?? ''),
    queryFn: async () => {
      const rows = await listEquipmentPhotos(kitchenId as string);
      return new Map<string, Photo>(rows.map((p) => [p.owner_id, p]));
    },
    enabled: !!kitchenId,
  });
}

// 照片的簽名網址（私有 bucket）。網址在這次開啟 App 期間重複使用
export function usePhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: queryKeys.photoUrls(paths),
    queryFn: () => signPhotoUrls(paths),
    enabled: paths.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}

// 上傳中的照片（暫存在手機、還沒傳完的）
export function useUploadState() {
  return useSyncExternalStore(subscribeUploads, getUploadState);
}

// 在 App 外殼用一次：打開時續傳沒傳完的照片，傳完後把照片清單標成過期重讀
export function usePhotoSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void flushPendingPhotos();
    return onPhotoCommitted((kitchenId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.equipmentPhotos(kitchenId) });
    });
  }, [queryClient]);
}

// 選好一張照片：在手機端壓縮成三種尺寸，放進暫存佇列後背景上傳
export function useSetEquipmentPhoto(kitchenId: string | undefined) {
  return useMutation({
    mutationFn: async (v: { equipmentId: string; file: Blob }) => {
      const photo = await processPhoto(v.file, 'square');
      await enqueueEquipmentPhoto({ id: newId(), kitchenId: kitchenId as string, equipmentId: v.equipmentId, photo });
    },
  });
}

export function useDeletePhoto(kitchenId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: Photo) => deletePhoto(photo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.equipmentPhotos(kitchenId ?? '') }),
  });
}
