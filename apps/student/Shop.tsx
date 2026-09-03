import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Gem, Heart, Zap, Check, Loader2, Lock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useInventory, useStudentGems, useBuyShopItem, useAvatarCatalog, useMyAvatar, useEquipItem, useSetAvatarBody } from '../../hooks/useQueries';
import { GamificationService } from '../../services/GamificationService';
import { AvatarItem, AVATAR_SLOTS, GENERATED_MEDIA_PUBLIC, RARITY_META, SLOT_LABELS, slotAvailableForBody, AvatarConfig } from '../../services/avatarCore';
import Avatar from '../../components/shared/Avatar';

interface ShopProps {
  onBack: () => void;
  onOpenStudio?: () => void;
}

const Shop: React.FC<ShopProps> = ({ onBack, onOpenStudio }) => {
  const { t } = useTranslation();
  const { data: gemCount, isError: gemsError } = useStudentGems();
  const { data: inventory = [], isLoading, isError: inventoryError, refetch } = useInventory();
  const buyItem = useBuyShopItem();
  const equipItem = useEquipItem();
  const setBody = useSetAvatarBody();
  const { data: catalog = [] } = useAvatarCatalog();
  const { data: myAvatar } = useMyAvatar();

  const gems: number | null = gemsError ? null : (gemCount ?? 0);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ownedIds = useMemo(() => new Set(inventory.map((i: any) => i.item_id)), [inventory]);
  const config: AvatarConfig | undefined = myAvatar?.config;
  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);

  const powerups = useMemo(() => catalog.filter((i) => i.kind === 'powerup'), [catalog]);
  const bases = useMemo(() => catalog.filter((i) => i.kind === 'base'), [catalog]);
  const items = useMemo(() => catalog.filter((i) => i.kind === 'item' && i.slot), [catalog]);

  const isUsable = (item: AvatarItem) => item.unlock_type === 'default' || item.cost === 0 || ownedIds.has(item.id);

  const handleBuy = async (item: AvatarItem) => {
    if (pendingId) return;
    if (gems === null || gems < item.cost) {
      toast.error(t('student.notEnoughGems', 'Not enough gems yet — keep learning to earn more!'), { icon: '💎' });
      return;
    }
    setPendingId(item.id);
    try {
      const result = await buyItem.mutateAsync({ itemId: item.id, cost: item.cost });
      if (result.success) {
        toast.success(t('student.itemPurchased', 'Item purchased!'), { icon: '✨' });
      } else {
        toast.error(t('student.purchaseFailed', "Purchase failed — your gems weren't spent. Try again."));
      }
    } catch {
      toast.error(t('student.purchaseError', 'Purchase may not have gone through — check your gems and try again.'));
    } finally {
      setPendingId(null);
    }
  };

  /** Buy-then-use for power-ups with inventory semantics. */
  const handlePowerup = async (item: AvatarItem, action: 'buy' | 'use') => {
    if (pendingId) return;
    setPendingId(item.id);
    try {
      if (action === 'buy') {
        const result = await buyItem.mutateAsync({ itemId: item.id, cost: item.cost });
        if (!result.success) {
          toast.error(t('student.purchaseFailed', "Purchase failed — your gems weren't spent. Try again."));
        }
        return;
      }
      if (item.id === 'hearts') {
        const result = await GamificationService.useHeartRefill();
        if (result.success) toast.success(t('student.heartsRestored', { defaultValue: 'Hearts restored — {{n}}/5!', n: result.hearts }), { icon: '❤️' });
        else if (result.hearts >= 5) toast(t('student.heartsFull', 'Your hearts are already full!'), { icon: '❤️' });
        else toast.error(t('student.refillFailed', "Couldn't use the refill — try again."));
      }
    } finally {
      setPendingId(null);
    }
  };

  const handleAvatarItem = async (item: AvatarItem) => {
    if (pendingId) return;
    if (!isUsable(item)) {
      await handleBuy(item);
      return;
    }
    setPendingId(item.id);
    try {
      if (item.kind === 'base') {
        await setBody.mutateAsync(item.id as AvatarConfig['body']);
      } else {
        const slot = item.slot!;
        const unequip = config?.items[slot] === item.id;
        const res = await equipItem.mutateAsync({ itemId: unequip ? null : item.id, slot });
        if (!res.ok && res.error) toast.error(res.error === 'not_owned' ? t('student.avatarNotOwned', 'Buy this item first!') : t('student.avatarActionFailed', 'Could not equip — try again.'));
      }
    } finally {
      setPendingId(null);
    }
  };

  const handleUseHeartRefill = async () => {
    if (pendingId) return;
    const heartsItem = powerups.find((p) => p.id === 'hearts');
    if (heartsItem) return handlePowerup(heartsItem, 'use');
  };

  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const equippedId = (slot: string) => (config ? config.items[slot as keyof typeof config.items] : null);

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans max-w-md mx-auto">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
            <ChevronLeft size={24} />
          </button>
          <span className="font-bold text-slate-800 text-lg">{t('student.shop', 'Shop')}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
          <Gem size={18} className="text-blue-500 fill-blue-500" />
          <span className="font-bold text-blue-600">{gems === null ? '—' : gems}</span>
        </div>
      </header>

      {inventoryError && (
        <div className="p-4">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center justify-center gap-3 text-sm text-slate-500">
            <span>{t('student.loadFailed', "Couldn't load —")}</span>
            <button onClick={() => refetch()} className="font-bold text-blue-500 hover:text-blue-600 underline">
              {t('student.retry', 'Retry')}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-8">

        {/* Your avatar hero */}
        <section className="bg-gradient-to-br from-pink-50 via-white to-blue-50 p-4 rounded-3xl border-2 border-pink-100 flex items-center gap-4">
          <Avatar src={myAvatar?.url || null} name="Me" size={72} idle />
          <div className="flex-1">
            <h3 className="font-bold text-slate-800">{t('student.yourAvatar', 'Your Avatar')}</h3>
            <p className="text-xs text-slate-500">{t('student.yourAvatarHint', 'Earn gems by learning, then customize your look.')}</p>
          </div>
          {onOpenStudio && (
            <button
              onClick={onOpenStudio}
              className="flex items-center gap-1.5 bg-duo-pink text-white font-bold text-sm px-4 py-2 rounded-xl shadow-[0_4px_0_0_#be185d] active:shadow-none active:translate-y-1 transition-all"
            >
              <Sparkles size={15} /> {t('student.studio', 'Studio')}
            </button>
          )}
        </section>

        {/* Characters (bases — species are the flagship purchase) */}
        <section>
          <h3 className="font-bold text-slate-800 text-lg mb-4">{t('student.characters', 'Characters')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {bases.map((base, index) => {
              const usable = isUsable(base);
              const active = config?.body === base.id;
              return (
                <motion.button
                  key={base.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleAvatarItem(base)}
                  disabled={pendingId !== null}
                  className={`bg-white p-3 rounded-2xl border-2 flex flex-col items-center text-center transition-all relative ${active ? 'border-duo-pink bg-pink-50' : base.rarity ? RARITY_META[base.rarity].ring : 'border-slate-200'} ${base.rarity ? RARITY_META[base.rarity].glow : ''}`}
                >
                  <img src={GENERATED_MEDIA_PUBLIC(`avatars/bases/${base.id}_skin1.png`)} alt={base.name} className="w-16 h-16 object-contain" />
                  <span className="font-bold text-slate-800 text-xs mt-1 capitalize">{base.id.replace('human_', '')}</span>
                  {active ? (
                    <span className="mt-1 flex items-center gap-1 text-green-600 font-bold text-xs"><Check size={12} /> {t('student.inUse', 'In use')}</span>
                  ) : usable ? (
                    <span className="mt-1 text-[10px] font-bold text-slate-400">{t('student.tapToUse', 'Tap to use')}</span>
                  ) : (
                    <span className="mt-1 flex items-center gap-1 justify-center text-xs font-bold text-slate-600">
                      {pendingId === base.id ? <Loader2 size={12} className="animate-spin" /> : <><Gem size={12} className="fill-blue-400 text-blue-400" /> {base.cost}</>}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Wardrobe by slot */}
        {AVATAR_SLOTS.map((slot) => {
          const slotItems = items.filter((i) => i.slot === slot);
          if (slotItems.length === 0) return null;
          if (config && !slotAvailableForBody(slot, config.body)) return null;
          return (
            <section key={slot}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800">{t(`student.slot_${slot}`, SLOT_LABELS[slot])}</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{slotItems.length} items</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {slotItems.map((item) => {
                  const usable = isUsable(item);
                  const equipped = equippedId(slot) === item.id;
                  const rarity = item.rarity ? RARITY_META[item.rarity] : null;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAvatarItem(item)}
                      disabled={pendingId !== null}
                      className={`bg-white p-2 rounded-2xl border-2 flex flex-col items-center justify-between aspect-square transition-all relative ${equipped ? 'border-duo-pink bg-pink-50' : rarity ? rarity.ring : 'border-slate-200'} ${rarity?.glow || ''} hover:scale-105`}
                      title={item.name}
                    >
                      {item.layer_asset_path && (
                        <img src={GENERATED_MEDIA_PUBLIC(item.layer_asset_path)} alt={item.name} className="w-full h-4/5 object-contain" draggable={false} />
                      )}
                      {equipped ? (
                        <Check size={13} className="text-duo-pink" />
                      ) : usable ? (
                        <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">{item.name}</span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-600">
                          {pendingId === item.id ? <Loader2 size={10} className="animate-spin" /> : <><Gem size={10} className="fill-blue-400 text-blue-400" />{item.cost}</>}
                        </span>
                      )}
                      {rarity && item.rarity !== 'common' && (
                        <span className={`absolute top-1 left-1 text-[7px] font-black uppercase px-1 py-0.5 rounded-full ${rarity.chip}`}>{rarity.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Power-ups (catalog-driven; behavior unchanged) */}
        <section>
          <h3 className="font-bold text-slate-800 text-lg mb-4">{t('student.powerups', 'Power-ups')}</h3>
          <div className="space-y-4">
            {powerups.map((item) => {
              const owned = inventory.find((i: any) => i.item_id === item.id);
              const ownedQty = owned?.quantity ?? (owned ? 1 : 0);
              const icon = item.id === 'freeze' ? Zap : Heart;
              const Icon = icon;
              return (
                <div key={item.id} className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${item.id === 'freeze' ? 'bg-blue-100 text-blue-500' : 'bg-red-100 text-red-500'}`}>
                    <Icon size={32} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800">{item.name}</h4>
                      {ownedQty > 0 && (
                        <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                          ×{ownedQty} {item.id === 'freeze' ? 'ready' : 'owned'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-tight mt-1">
                      {item.description}
                      {item.id === 'freeze' && ' ' + t('student.freezeAuto', 'Used automatically if you miss a day.')}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => handlePowerup(item, 'buy')}
                        disabled={pendingId !== null}
                        className={`flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm px-4 py-1.5 rounded-lg font-bold text-sm text-slate-700 hover:bg-slate-50 active:translate-y-0.5 transition-all ${pendingId !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Gem size={14} className="text-blue-500 fill-blue-500" />
                        {pendingId === item.id ? <Loader2 size={14} className="animate-spin" /> : item.cost}
                      </button>
                      {item.id === 'hearts' && ownedQty > 0 && (
                        <button
                          onClick={handleUseHeartRefill}
                          disabled={pendingId !== null}
                          className={`flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-red-100 active:translate-y-0.5 transition-all ${pendingId !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {pendingId === 'hearts' ? <Loader2 size={14} className="animate-spin" /> : <><Heart size={14} className="fill-red-500 text-red-500" /> Use</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="text-center text-[11px] text-slate-400 pb-2 flex items-center justify-center gap-1">
          <Lock size={11} /> {t('student.avatarSafety', 'Everything here is earned by learning — no real money, ever.')}
        </p>
      </div>
    </div>
  );
};

export default Shop;
