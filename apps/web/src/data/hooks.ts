// TanStack Query 的讀取。資料一律即時向雲端讀取，不做離線快取（04 ADR-02）。
import { useQuery } from '@tanstack/react-query';
import { getMyIdentity, getMySettings } from './account.ts';
import { listMyKitchens } from './kitchens.ts';

export const queryKeys = {
  settings: ['me', 'settings'] as const,
  identity: ['me', 'identity'] as const,
  kitchens: ['me', 'kitchens'] as const,
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
