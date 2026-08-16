
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Gem, Heart, Zap, Shirt, Crown, Glasses, Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useInventory, useStudentGems, useBuyShopItem } from '../../hooks/useQueries';
import { GamificationService } from '../../services/GamificationService';
import { toast } from 'sonner';

interface ShopProps {
   onBack: () => void;
}

const Shop: React.FC<ShopProps> = ({ onBack }) => {
   const { data: gemCount = 0 } = useStudentGems();
   const { data: inventory = [], isLoading } = useInventory();
   const buyItem = useBuyShopItem();
  const { t } = useTranslation();
   const [purchased, setPurchased] = useState<string[]>([]);

   const purchasedIds = purchased.length > 0 ? purchased : inventory.map((i: any) => i.item_id);

   const powerups = [
      { id: 'freeze', name: 'Streak Freeze', desc: 'Miss a day without losing your streak.', cost: 200, icon: Zap, color: 'text-blue-500', bg: 'bg-blue-100' },
      { id: 'hearts', name: 'Heart Refill', desc: 'Restore 5 hearts to keep learning.', cost: 100, icon: Heart, color: 'text-red-500', bg: 'bg-red-100' },
   ];

   const items = [
      { id: 'hat_crown', name: 'Gold Crown', cost: 300, icon: Crown, color: 'text-yellow-600', bg: 'bg-yellow-100' },
      { id: 'shirt_space', name: 'Space Suit', cost: 150, icon: Shirt, color: 'text-purple-600', bg: 'bg-purple-100' },
      { id: 'glass_cool', name: 'Cool Shades', cost: 120, icon: Glasses, color: 'text-slate-800', bg: 'bg-slate-200' },
   ];

    const handleBuy = async (id: string, cost: number) => {
       if (purchasedIds.includes(id) && id !== 'hearts' && id !== 'freeze') return;
       if (gemCount < cost) {
          toast.error(t('student.notEnoughGems', 'Not enough gems yet — keep learning to earn more!'), { icon: '💎' });
          return;
       }
       const result = await buyItem.mutateAsync({ itemId: id, cost });
       if (result.success) {
          setPurchased(prev => [...prev, id]);
          toast.success(t('student.itemPurchased', 'Item purchased!'));
       } else {
          toast.error(t('student.purchaseFailed', "Purchase failed — your gems weren't spent. Try again."));
       }
    };

    const handleUseHeartRefill = async () => {
       const result = await GamificationService.useHeartRefill();
       if (result.success) {
          toast.success(t('student.heartsRestored', { defaultValue: 'Hearts restored — {{n}}/5!', n: result.hearts }), { icon: '❤️' });
       } else if (result.hearts >= 5) {
          toast(t('student.heartsFull', 'Your hearts are already full!'), { icon: '❤️' });
       } else {
          toast.error(t('student.refillFailed', "Couldn't use the refill — try again."));
       }
    };

   if (isLoading) {
      return (
         <div className="h-full bg-slate-50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
         </div>
      );
   }

   return (
      <div className="h-full bg-slate-50 flex flex-col font-sans">
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
                <span className="font-bold text-blue-600">{gemCount}</span>
            </div>
         </header>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-8">

            {/* Power Ups */}
            <section>
               <h3 className="font-bold text-slate-800 text-lg mb-4">{t('student.powerups', 'Power-ups')}</h3>
               <div className="space-y-4">
                  {powerups.map((item, index) => {
                     const owned = inventory.find((i: any) => i.item_id === item.id);
                     const ownedQty = owned?.quantity ?? (owned ? 1 : 0);
                     return (
                     <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-4"
                     >
                        <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${item.bg} ${item.color}`}>
                           <item.icon size={32} />
                        </div>
                        <div className="flex-1">
                           <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-800">{t(`student.item_${item.id}`, item.name)}</h4>
                              {ownedQty > 0 && (
                                 <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                    ×{ownedQty} {item.id === 'freeze' ? 'ready' : 'owned'}
                                 </span>
                              )}
                           </div>
                           <p className="text-xs text-slate-500 leading-tight mt-1">
                              {t(`student.itemDesc_${item.id}`, item.desc)}
                              {item.id === 'freeze' && ' ' + t('student.freezeAuto', 'Used automatically if you miss a day.')}
                           </p>
                           <div className="mt-3 flex items-center gap-2">
                              <button
                                 onClick={() => handleBuy(item.id, item.cost)}
                                 className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm px-4 py-1.5 rounded-lg font-bold text-sm text-slate-700 hover:bg-slate-50 active:translate-y-0.5 transition-all"
                              >
                                 <Gem size={14} className="text-blue-500 fill-blue-500" />
                                 {item.cost}
                              </button>
                              {item.id === 'hearts' && ownedQty > 0 && (
                                 <button
                                    onClick={handleUseHeartRefill}
                                    className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-red-100 active:translate-y-0.5 transition-all"
                                 >
                                    <Heart size={14} className="fill-red-500 text-red-500" /> Use
                                 </button>
                              )}
                           </div>
                        </div>
                     </motion.div>
                     );
                  })}
               </div>
            </section>

            {/* Outfits */}
            <section>
               <h3 className="font-bold text-slate-800 text-lg mb-4">{t('student.avatarStyle', 'Avatar Style')}</h3>
               <div className="grid grid-cols-2 gap-4">
                  {items.map((item, index) => {
                     const isOwned = purchasedIds.includes(item.id);
                     return (
                        <motion.div
                           key={item.id}
                           initial={{ opacity: 0, y: 20 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ delay: 0.2 + index * 0.1 }}
                           className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm flex flex-col items-center text-center"
                        >
                           <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 ${item.bg} ${item.color}`}>
                              <item.icon size={40} />
                           </div>
                           <h4 className="font-bold text-slate-800 text-sm mb-3">{t(`student.item_${item.id}`, item.name)}</h4>

                           {isOwned ? (
                              <div className="mt-auto flex items-center gap-2 text-green-600 font-bold text-sm bg-green-50 px-3 py-1.5 rounded-lg w-full justify-center">
                                 <Check size={16} /> {t('student.owned', 'Owned')}
                              </div>
                           ) : (
                              <button
                                 onClick={() => handleBuy(item.id, item.cost)}
                                  disabled={gemCount < item.cost}
                                  className={`mt-auto w-full py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-1 ${gemCount >= item.cost
                                        ? 'bg-duo-green text-white hover:bg-green-600 shadow-green-700'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-slate-300'
                                     }`}
                               >
                                  <Gem size={14} className={gemCount >= item.cost ? 'text-white/80 fill-white/80' : 'text-slate-400'} />
                                 {item.cost}
                              </button>
                           )}
                        </motion.div>
                     );
                  })}
               </div>
            </section>

         </div>
      </div>
   );
};

export default Shop;
