import type { Database } from '@zhusha/shared-types';

type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
