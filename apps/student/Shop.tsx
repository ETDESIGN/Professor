
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Gem, Heart, Zap, Shirt, Crown, Glasses, Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Engine } from '../../services/SupabaseService';

interface ShopProps {
   onBack: () => void;
   gemCount?: number;
}

const Shop: React.FC<ShopProps> = ({ onBack, gemCount = 450 }) => {
   const [localGems, setLocalGems] = useState(gemCount);
   const [purchased, setPurchased] = useState<string[]>([]);
   const [isLoading, setIsLoading] = useState(true);

   useEffect(() => {
      const loadData = async () => {
         setIsLoading(true);
         const progress = await Engine.getStudentProgress();
         // Assuming xp is used as gems for now, or we can add a gems field
         // Let's use XP as currency for simplicity in this prototype
         setLocalGems(progress.xp || 0);
         setIsLoading(false);
      };
      loadData();
   }, []);

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
      if (localGems >= cost && !purchased.includes(id)) {
         const newGems = localGems - cost;
         setLocalGems(newGems);
         setPurchased([...purchased, id]);
         await Engine.updateStudentProgress({ xp: newGems });
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
               <span className="font-bold text-slate-800 text-lg">Shop</span>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
               <Gem size={18} className="text-blue-500 fill-blue-500" />
               <span className="font-bold text-blue-600">{localGems}</span>
            </div>
         </header>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-8">

            {/* Power Ups */}
            <section>
               <h3 className="font-bold text-slate-800 text-lg mb-4">Power-ups</h3>
               <div className="space-y-4">
                  {powerups.map((item, index) => (
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
                           <h4 className="font-bold text-slate-800">{item.name}</h4>
                           <p className="text-xs text-slate-500 leading-tight mt-1">{item.desc}</p>
                           <button
                              onClick={() => handleBuy(item.id, item.cost)}
                              className="mt-3 flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm px-4 py-1.5 rounded-lg font-bold text-sm text-slate-700 hover:bg-slate-50 active:translate-y-0.5 transition-all w-fit"
                           >
                              <Gem size={14} className="text-blue-500 fill-blue-500" />
                              {item.cost}
                           </button>
                        </div>
                     </motion.div>
                  ))}
               </div>
            </section>

            {/* Outfits */}
            <section>
               <h3 className="font-bold text-slate-800 text-lg mb-4">Avatar Style</h3>
               <div className="grid grid-cols-2 gap-4">
                  {items.map((item, index) => {
                     const isOwned = purchased.includes(item.id);
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
                           <h4 className="font-bold text-slate-800 text-sm mb-3">{item.name}</h4>

                           {isOwned ? (
                              <div className="mt-auto flex items-center gap-2 text-green-600 font-bold text-sm bg-green-50 px-3 py-1.5 rounded-lg w-full justify-center">
                                 <Check size={16} /> Owned
                              </div>
                           ) : (
                              <button
                                 onClick={() => handleBuy(item.id, item.cost)}
                                 disabled={localGems < item.cost}
                                 className={`mt-auto w-full py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-1 ${localGems >= item.cost
                                       ? 'bg-duo-green text-white hover:bg-green-600 shadow-green-700'
                                       : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-slate-300'
                                    }`}
                              >
                                 <Gem size={14} className={localGems >= item.cost ? 'text-white/80 fill-white/80' : 'text-slate-400'} />
                                 {item.cost}
                              </button>
                           )}
                        </motion.div>
                     );
                  })}
               </div>
            </section>

            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white text-center relative overflow-hidden">
               <div className="relative z-10">
                  <h3 className="font-black text-xl italic uppercase tracking-wider mb-2">Get Plus</h3>
                  <p className="text-sm text-purple-100 mb-4">Unlimited hearts and no ads!</p>
                  <button className="bg-white text-purple-600 font-bold px-6 py-3 rounded-xl shadow-lg active:scale-95 transition-transform">
                     Try Free
                  </button>
               </div>
               <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
            </div>

         </div>
      </div>
   );
};

export default Shop;
