import { techniques } from '../../../../packages/equipment/src/index.ts';

const byId = new Map(techniques.map((t) => [t.id, t]));
export const getTechniqueName = (id: string): string => byId.get(id)?.name['zh-TW'] ?? id;
export const isKnownTechnique = (id: string): boolean => byId.has(id);
