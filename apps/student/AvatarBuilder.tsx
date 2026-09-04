import React, { useMemo, useState } from 'react';
import { ChevronLeft, Check, Loader2, Lock, Gem as GemIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AvatarConfig, AvatarItem, AvatarSlot, AVATAR_SLOTS, AVATAR_BODIES, SKIN_COUNT,
  GENERATED_MEDIA_PUBLIC, RARITY_META, RENDER_ORDER, SLOT_LABELS,
  configWithItem, slotAvailableForBody, thumbUrlFor,
} from '../../services/avatarCore';
import {
  useAvatarCatalog, useInventory, useBuyShopItem, useEquipItem,
  useSetAvatarBody, useSetAvatarSkin, useComposeAvatar,
} from '../../hooks/useQueries';

interface AvatarBuilderProps {
  onBack: () => void;
  onSave: (config: AvatarConfig, url: string | null) => void;
  initialConfig?: AvatarConfig | null;
}

const SKIN_SWATCHES = ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#5C3A21'];

/** Ordered layer stack for the LIVE client preview (no server round-trips). */
function previewLayers(config: AvatarConfig, byId: Map<string, AvatarItem>): { url: string; order: number }[] {
  const layers: { url: string; order: number }[] = [];
  for (const slot of AVATAR_SLOTS) {
    const id = config.items[slot];
    if (!id) continue;
    const item = byId.get(id);
    if (!item?.layer_asset_path) continue;
    if (!slotAvailableForBody(slot, config.body)) continue;
    layers.push({ url: GENERATED_MEDIA_PUBLIC(item.layer_asset_path), order: RENDER_ORDER.indexOf(slot) });
  }
  layers.push({ url: GENERATED_MEDIA_PUBLIC(`avatars/bases/${config.body}_skin${config.body.startsWith('human') ? config.skin : 1}.png`), order: RENDER_ORDER.indexOf('body') });
  return layers.sort((a, b) => a.order - b.order);
}

const AvatarBuilder: React.FC<AvatarBuilderProps> = ({ onBack, onSave, initialConfig }) => {
  const { t } = useTranslation();
  const { data: catalog = [] } = useAvatarCatalog();
  const { data: inventory = [] } = useInventory();
  const buyItem = useBuyShopItem();
  const equipItem = useEquipItem();
  const setBody = useSetAvatarBody();
  const setSkin = useSetAvatarSkin();
  const composeAvatar = useComposeAvatar();

  const [config, setConfig] = useState<AvatarConfig>(
    initialConfig || { version: 1, body: 'human_boy', skin: 1, items: {} },
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSlot, setActiveSlot] = useState<AvatarSlot | 'character'>('character');

  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const ownedIds = useMemo(() => new Set(inventory.map((i: any) => i.item_id)), [inventory]);
  const bases = useMemo(() => catalog.filter((i) => i.kind === 'base'), [catalog]);
  const layers = useMemo(() => previewLayers(config, byId), [config, byId]);

  const availableSlots = useMemo(
    () => AVATAR_SLOTS.filter((slot) => slotAvailableForBody(slot, config.body)),
    [config.body],
  );

  const isUsable = (item: AvatarItem): boolean =>
    item.unlock_type === 'default' || ownedIds.has(item.id);

  const applyResult = (res: { ok: boolean; config?: AvatarConfig; error?: string }): boolean => {
    if (res.ok && res.config) {
      setConfig(res.config);
      return true;
    }
    toast.error(res.error === 'not_owned' ? t('student.avatarNotOwned', 'Buy this item first!') : t('student.avatarActionFailed', 'Could not save — try again.'));
    return false;
  };

  const handlePickBase = async (base: AvatarItem) => {
    if (busyId || base.id === config.body) return;
    setBusyId(base.id);
    try {
      if (!isUsable(base)) {
        const res = await buyItem.mutateAsync({ itemId: base.id, cost: base.cost });
        if (!res.success) {
          toast.error(t('student.notEnoughGems', 'Not enough gems yet — keep learning to earn more!'), { icon: '💎' });
          return;
        }
      }
      applyResult(await setBody.mutateAsync(base.id as AvatarConfig['body']));
    } finally {
      setBusyId(null);
    }
  };

  const handleSkin = async (skin: number) => {
    if (busyId || skin === config.skin) return;
    setBusyId(`skin${skin}`);
    try {
      applyResult(await setSkin.mutateAsync(skin));
    } finally {
      setBusyId(null);
    }
  };

  const handlePickItem = async (item: AvatarItem | null, slot: AvatarSlot) => {
    if (busyId) return;
    const current = config.items[slot];
    if (item && (current === item.id)) {
      // Tap equipped item → unequip.
      setConfig(configWithItem(config, slot, null));
      applyResult(await equipItem.mutateAsync({ itemId: null, slot }));
      return;
    }
    const id = item?.id || null;
    setBusyId(id || `none-${slot}`);
    try {
      if (item && !isUsable(item)) {
        const res = await buyItem.mutateAsync({ itemId: item.id, cost: item.cost });
        if (!res.success) {
          toast.error(t('student.notEnoughGems', 'Not enough gems yet — keep learning to earn more!'), { icon: '💎' });
          return;
        }
      }
      setConfig((prev) => configWithItem(prev, slot, id));
      applyResult(await equipItem.mutateAsync({ itemId: id, slot }));
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Every pick already persisted its equip RPC; compose the cached render.
      const url = await composeAvatar.mutateAsync();
      onSave(config, url || null);
    } finally {
      setSaving(false);
    }
  };

  const slotItems = (slot: AvatarSlot) =>
    catalog.filter((i) => i.kind === 'item' && i.slot === slot);

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans max-w-md mx-auto">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex justify-between items-center">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
          <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-slate-800">{t('student.avatarStudio', 'Avatar Studio')}</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="p-2 -mr-2 text-green-600 hover:bg-green-50 rounded-full disabled:opacity-50"
        >
          {saving ? <Loader2 size={24} className="animate-spin" /> : <Check size={24} strokeWidth={3} />}
        </button>
      </header>

      {/* Live layer-stack preview — instant, zero API calls per tap */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-slate-50 relative overflow-hidden min-h-[280px]">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="w-60 h-60 relative animate-bounce-subtle"
        >
          {layers.map((l, idx) => (
            <img key={`${l.order}-${idx}`} src={l.url} alt="" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
          ))}
        </motion.div>
      </div>

      {/* Controls */}
      <div className="bg-white border-t border-slate-200 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 pb-2 overflow-x-auto border-b border-slate-100">
          <TabButton label={t('student.avatarCharacter', 'Character')} isActive={activeSlot === 'character'} onClick={() => setActiveSlot('character')} />
          {availableSlots.map((slot) => (
            <TabButton key={slot} label={t(`student.slot_${slot}`, SLOT_LABELS[slot])} isActive={activeSlot === slot} onClick={() => setActiveSlot(slot)} />
          ))}
        </div>

        <div className="h-56 p-4 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeSlot === 'character' && (
              <motion.div key="character" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="space-y-5">
                {/* Body */}
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {(bases.length ? bases : AVATAR_BODIES.map((b) => ({ id: b, cost: b.startsWith('human') ? 0 : 150 })) as AvatarItem[]).map((base) => {
                    const usable = base.cost === 0 || ownedIds.has(base.id) || isUsable(base);
                    const active = config.body === base.id;
                    return (
                      <button
                        key={base.id}
                        onClick={() => handlePickBase(base)}
                        disabled={busyId !== null}
                        className={`shrink-0 w-20 flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition-all ${active ? 'border-duo-pink bg-pink-50' : 'border-slate-200 hover:border-slate-300'} ${busyId === base.id ? 'opacity-60' : ''}`}
                      >
                        <img src={GENERATED_MEDIA_PUBLIC(`avatars/bases/${base.id}_skin1.png`)} alt={base.name} className="w-14 h-14 object-contain" />
                        <span className="text-[11px] font-bold text-slate-700 capitalize">{base.id.replace('human_', '')}</span>
                        {usable ? (
                          active && <Check size={14} className="text-duo-pink" />
                        ) : (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500"><Lock size={10} /> {base.cost}💎</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Skin (humans only) */}
                {config.body.startsWith('human') && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('student.avatarSkin', 'Skin tone')}</p>
                    <div className="flex gap-3 flex-wrap">
                      {Array.from({ length: SKIN_COUNT }, (_, i) => i + 1).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSkin(s)}
                          disabled={busyId !== null}
                          className={`w-11 h-11 rounded-full border-4 transition-transform hover:scale-110 ${config.skin === s ? 'border-duo-pink scale-110' : 'border-white shadow-sm'}`}
                          style={{ backgroundColor: SKIN_SWATCHES[s - 1] }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeSlot !== 'character' && (
              <motion.div key={activeSlot} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className="grid grid-cols-4 gap-3">
                {/* None card */}
                <button
                  onClick={() => handlePickItem(null, activeSlot)}
                  disabled={busyId !== null}
                  className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${!config.items[activeSlot] ? 'border-duo-pink bg-pink-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <span className="text-2xl">🚫</span>
                  <span className="text-[10px] font-bold text-slate-500">{t('student.avatarNone', 'None')}</span>
                </button>
                {slotItems(activeSlot).map((item) => {
                  const equipped = config.items[activeSlot] === item.id;
                  const usable = isUsable(item);
                  const rarity = item.rarity ? RARITY_META[item.rarity] : null;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handlePickItem(item, activeSlot)}
                      disabled={busyId !== null}
                      className={`aspect-square rounded-2xl border-2 p-1 flex flex-col items-center justify-between transition-all relative ${equipped ? 'border-duo-pink bg-pink-50' : rarity?.ring ? rarity.ring : 'border-slate-200'} ${!usable ? 'opacity-90' : ''} hover:scale-105 ${busyId === item.id ? 'opacity-60' : ''}`}
                      title={item.name}
                    >
                      {item.layer_asset_path && (
                        <img src={thumbUrlFor(item.id)} alt={item.name} className="w-full h-4/5 object-contain" draggable={false} />
                      )}
                      {usable ? (
                        equipped ? <Check size={13} className="text-duo-pink" /> : <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center px-0.5">{item.name}</span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-600"><GemIcon size={10} className="fill-blue-400 text-blue-400" />{item.cost}</span>
                      )}
                      {item.compatible_bodies.length > 0 && (
                        <span className="absolute top-1 right-1 text-[8px] font-bold bg-purple-100 text-purple-600 px-1 rounded-full">{item.compatible_bodies[0]}</span>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
  >
    {label}
  </button>
);

export default AvatarBuilder;
