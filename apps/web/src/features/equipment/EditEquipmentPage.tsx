import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNavigate, useParams } from 'react-router';
import { getEquipmentType, techniques } from '@zhusha/equipment';
import {
  useCurrentKitchen,
  useDeleteKitchenEquipment,
  useEquipmentPhotos,
  useKitchenEquipmentItem,
  useUpdateKitchenEquipment,
} from '../../data/hooks.ts';
import type { KitchenEquipment } from '../../data/equipment.ts';
import { removeFiles } from '../../data/photos.ts';
import { EquipmentPhoto } from './EquipmentPhoto.tsx';
import { SubPage } from '../shell/SubPage.tsx';

const INPUT = 'h-12 rounded-card border border-line bg-surface px-3 text-body text-ink';
const UNITS = ['公升', '人份', '公分', '公斤', '毫升'];
const techniqueName = (id: string) => techniques.find((t) => t.id === id)?.name['zh-TW'] ?? id;

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-ink-muted">
        {label}
        {optional && <> <FormattedMessage id="equipment.field.optionalHint" /></>}
      </span>
      {children}
    </label>
  );
}

function Form({ item, kitchenId }: { item: KitchenEquipment; kitchenId: string }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const update = useUpdateKitchenEquipment(kitchenId);
  const remove = useDeleteKitchenEquipment(kitchenId);
  const photo = useEquipmentPhotos(kitchenId).data?.get(item.id);
  const type = getEquipmentType(item.equipment_type_id);

  const [name, setName] = useState(item.raw_name);
  const [brand, setBrand] = useState(item.brand ?? '');
  const [model, setModel] = useState(item.model ?? '');
  const [capacity, setCapacity] = useState(item.capacity_value != null ? String(item.capacity_value) : '');
  const [unit, setUnit] = useState(item.capacity_unit ?? '');
  const [acquiredAt, setAcquiredAt] = useState(item.acquired_at ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [optional, setOptional] = useState(new Set(item.enabled_optional_techniques));
  const [capacityError, setCapacityError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleOptional(id: string) {
    setOptional((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    // 容量是「數字＋單位」一起存；只填單位不填數字就當作沒有容量
    const value = capacity.trim() === '' ? null : Number(capacity);
    if (value !== null && (!Number.isFinite(value) || value <= 0 || !unit.trim())) {
      setCapacityError(true);
      return;
    }
    setCapacityError(false);
    try {
      await update.mutateAsync({
        id: item.id,
        patch: {
          ...(type ? {} : { raw_name: name.trim() || item.raw_name }),
          brand: brand.trim() || null,
          model: model.trim() || null,
          capacity_value: value,
          capacity_unit: value === null ? null : unit.trim(),
          acquired_at: acquiredAt || null,
          description: description.trim() || null,
          enabled_optional_techniques: [...optional],
        },
      });
      void navigate(-1);
    } catch {
      // 錯誤訊息由下方 update.isError 顯示
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <h2 className="m-0 font-round text-heading font-bold">{item.raw_name}</h2>

      <EquipmentPhoto equipmentId={item.id} />

      {type && (
        <section className="flex flex-col gap-2 rounded-card bg-surface p-3">
          <span className="text-caption text-ink-muted"><FormattedMessage id="equipment.techniques" /></span>
          {type.techniques.length === 0 ? (
            <span className="text-caption"><FormattedMessage id="equipment.techniques.none" /></span>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {type.techniques.map((t) => (
                <li key={t} className="rounded-full bg-line-soft px-3 py-1 text-caption">{techniqueName(t)}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!type && (
        <Field label={intl.formatMessage({ id: 'equipment.field.name' })}>
          <input type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </Field>
      )}

      <Field label={intl.formatMessage({ id: 'equipment.field.brand' })} optional>
        <input type="text" maxLength={60} value={brand} onChange={(e) => setBrand(e.target.value)} className={INPUT} />
      </Field>
      <Field label={intl.formatMessage({ id: 'equipment.field.model' })} optional>
        <input type="text" maxLength={60} value={model} onChange={(e) => setModel(e.target.value)} className={INPUT} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={intl.formatMessage({ id: 'equipment.field.capacity' })} optional>
          <input type="number" inputMode="decimal" min="0" step="any" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={INPUT} />
        </Field>
        <Field label={intl.formatMessage({ id: 'equipment.field.unit' })}>
          <input type="text" list="equipment-units" maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} className={INPUT} />
          <datalist id="equipment-units">
            {UNITS.map((u) => <option key={u} value={u} />)}
          </datalist>
        </Field>
      </div>
      {capacityError && <p role="alert" className="m-0 -mt-2 text-caption text-error"><FormattedMessage id="equipment.error.capacity" /></p>}
      <Field label={intl.formatMessage({ id: 'equipment.field.acquiredAt' })} optional>
        <input type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} className={INPUT} />
      </Field>
      <Field label={intl.formatMessage({ id: 'equipment.field.description' })} optional>
        <textarea
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-card border border-line bg-surface p-3 text-body text-ink"
        />
      </Field>

      {type?.optionalTechniques?.map((t) => (
        <label key={t} className="flex min-h-12 items-center gap-3 rounded-card bg-surface px-3 text-body">
          <span className="flex-1">{intl.formatMessage({ id: 'equipment.optional' }, { technique: techniqueName(t) })}</span>
          <input
            type="checkbox"
            role="switch"
            checked={optional.has(t)}
            onChange={() => toggleOptional(t)}
            className="relative h-[26px] w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors before:absolute before:top-[3px] before:left-[3px] before:size-5 before:rounded-full before:bg-surface before:transition-transform before:content-[''] checked:bg-bulb checked:before:translate-x-[18px]"
          />
        </label>
      ))}

      {(update.isError || remove.isError) && (
        <p role="alert" className="m-0 text-caption text-error"><FormattedMessage id="equipment.error.write" /></p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] bg-bg px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-caption">{intl.formatMessage({ id: 'equipment.delete.confirm' }, { name: item.raw_name })}</span>
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 rounded-card border border-line bg-surface px-4 text-body text-ink">
              <FormattedMessage id="equipment.delete.cancel" />
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(item.id, {
                  onSuccess: () => {
                    // 照片資料列由資料庫連動刪除；檔案盡力清掉，清不掉的由維護工作掃孤兒檔
                    if (photo) void removeFiles([photo.storage_path, photo.feed_path, photo.thumb_path]).catch(() => undefined);
                    void navigate(-1);
                  },
                })
              }
              className="h-12 rounded-card border-0 bg-error px-4 text-body font-bold text-surface disabled:opacity-50"
            >
              <FormattedMessage id="equipment.delete.yes" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-12 rounded-card border border-line bg-surface px-4 text-body text-error">
              <FormattedMessage id="equipment.delete" />
            </button>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => void save()}
              className="h-12 flex-1 rounded-card border-0 bg-bulb text-body font-bold text-ink disabled:opacity-50"
            >
              {intl.formatMessage({ id: update.isPending ? 'equipment.saving' : 'equipment.save' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 編輯一件廚具：手法由類型決定，只顯示、不能改；其餘是選填資料
export function EditEquipmentPage() {
  const intl = useIntl();
  const { id } = useParams();
  const { kitchen } = useCurrentKitchen();
  const item = useKitchenEquipmentItem(kitchen?.id, id);
  return (
    <SubPage srTitle={intl.formatMessage({ id: 'equipment.edit' })}>
      {item.isPending ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="common.loading" /></p>
      ) : !item.data || !kitchen ? (
        <p className="m-0 text-caption text-ink-muted"><FormattedMessage id="equipment.notFound" /></p>
      ) : (
        <Form key={item.data.id} item={item.data} kitchenId={kitchen.id} />
      )}
    </SubPage>
  );
}
