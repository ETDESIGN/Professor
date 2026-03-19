import React, { useState } from 'react';
import { ChevronLeft, Check, Palette, Shirt, Smile, VenetianMask as Mask } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AvatarBuilderProps {
  onBack: () => void;
  onSave: (config: any) => void;
  initialConfig?: any;
}

const AvatarBuilder: React.FC<AvatarBuilderProps> = ({ onBack, onSave, initialConfig }) => {
  const [config, setConfig] = useState(initialConfig || {
    skinColor: '#FFDBAC',
    shirtColor: '#3B82F6',
    shirtType: 'basic',
    hatType: 'none',
    expression: 'happy'
  });

  const [activeTab, setActiveTab] = useState<'skin' | 'shirt' | 'hat' | 'face'>('skin');

  const skinColors = ['#FFDBAC', '#E0AC69', '#8D5524', '#C68642', '#F1C27D', '#FFAD60', '#FFE0BD'];
  const shirtColors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#111827'];
  const hatTypes = ['none', 'cap', 'beanie', 'crown', 'headset'];
  const expressions = ['happy', 'cool', 'surprised', 'neutral'];

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex justify-between items-center">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
           <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-slate-800">Customize Avatar</span>
        <button onClick={() => onSave(config)} className="p-2 -mr-2 text-green-600 hover:bg-green-50 rounded-full">
           <Check size={24} strokeWidth={3} />
        </button>
      </header>

      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-slate-50 relative overflow-hidden">
         {/* Background Decor */}
         <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
         
         <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="w-64 h-64 relative drop-shadow-2xl animate-bounce-subtle"
         >
            <AvatarRenderer config={config} />
         </motion.div>
      </div>

      {/* Customization Controls */}
      <div className="bg-white border-t border-slate-200 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
         
         {/* Tabs */}
         <div className="flex justify-around p-2 border-b border-slate-100">
            <TabButton icon={Palette} isActive={activeTab === 'skin'} onClick={() => setActiveTab('skin')} />
            <TabButton icon={Shirt} isActive={activeTab === 'shirt'} onClick={() => setActiveTab('shirt')} />
            <TabButton icon={Mask} isActive={activeTab === 'hat'} onClick={() => setActiveTab('hat')} />
            <TabButton icon={Smile} isActive={activeTab === 'face'} onClick={() => setActiveTab('face')} />
         </div>

         {/* Options Grid */}
         <div className="h-48 p-6 overflow-y-auto">
            <AnimatePresence mode="wait">
               {activeTab === 'skin' && (
                  <motion.div 
                     key="skin"
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 20 }}
                     className="flex flex-wrap gap-4 justify-center"
                  >
                     {skinColors.map(color => (
                        <button 
                           key={color} 
                           onClick={() => setConfig({ ...config, skinColor: color })}
                           className={`w-12 h-12 rounded-full border-4 transition-transform hover:scale-110 ${config.skinColor === color ? 'border-blue-500 scale-110' : 'border-white shadow-sm'}`}
                           style={{ backgroundColor: color }}
                        />
                     ))}
                  </motion.div>
               )}

               {activeTab === 'shirt' && (
                  <motion.div 
                     key="shirt"
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 20 }}
                     className="space-y-4"
                  >
                     <div className="flex flex-wrap gap-4 justify-center">
                        {shirtColors.map(color => (
                           <button 
                              key={color} 
                              onClick={() => setConfig({ ...config, shirtColor: color })}
                              className={`w-12 h-12 rounded-full border-4 transition-transform hover:scale-110 ${config.shirtColor === color ? 'border-blue-500 scale-110' : 'border-white shadow-sm'}`}
                              style={{ backgroundColor: color }}
                           />
                        ))}
                     </div>
                  </motion.div>
               )}

               {activeTab === 'hat' && (
                  <motion.div 
                     key="hat"
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 20 }}
                     className="flex flex-wrap gap-4 justify-center"
                  >
                     {hatTypes.map(type => (
                        <button 
                           key={type} 
                        onClick={() => setConfig({ ...config, hatType: type })}
                        className={`
                           px-4 py-2 rounded-xl border-2 font-bold text-sm capitalize transition-all
                           ${config.hatType === type ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}
                        `}
                     >
                        {type}
                     </button>
                  ))}
               </motion.div>
            )}

            {activeTab === 'face' && (
               <motion.div 
                  key="face"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex flex-wrap gap-4 justify-center"
               >
                  {expressions.map(exp => (
                     <button 
                        key={exp} 
                        onClick={() => setConfig({ ...config, expression: exp })}
                        className={`
                           px-4 py-2 rounded-xl border-2 font-bold text-sm capitalize transition-all
                           ${config.expression === exp ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}
                        `}
                     >
                        {exp}
                     </button>
                  ))}
               </motion.div>
            )}
            </AnimatePresence>
         </div>
      </div>
    </div>
  );
};

const TabButton = ({ icon: Icon, isActive, onClick }: any) => (
   <button 
      onClick={onClick}
      className={`p-4 rounded-2xl transition-all ${isActive ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}
   >
      <Icon size={24} />
   </button>
);

// A simple SVG composer for the avatar
const AvatarRenderer = ({ config }: { config: any }) => {
   return (
      <svg viewBox="0 0 200 200" className="w-full h-full">
         <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
               <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(0,0,0,0.15)"/>
            </filter>
         </defs>
         
         {/* Body */}
         <path d="M50 160 Q100 220 150 160 L150 200 L50 200 Z" fill={config.shirtColor} filter="url(#shadow)" />
         <circle cx="100" cy="190" r="30" fill="rgba(0,0,0,0.1)" /> {/* Shirt Detail */}

         {/* Neck */}
         <rect x="85" y="130" width="30" height="40" fill={config.skinColor} />

         {/* Head */}
         <rect x="60" y="50" width="80" height="100" rx="40" fill={config.skinColor} filter="url(#shadow)" />

         {/* Face */}
         {config.expression === 'happy' && (
            <g>
               <circle cx="80" cy="90" r="5" fill="#111827" />
               <circle cx="120" cy="90" r="5" fill="#111827" />
               <path d="M80 110 Q100 130 120 110" stroke="#111827" strokeWidth="4" fill="none" strokeLinecap="round" />
            </g>
         )}
         {config.expression === 'cool' && (
            <g>
               <path d="M70 85 Q100 85 130 85 L125 100 Q100 100 75 100 Z" fill="#111827" /> {/* Shades */}
               <path d="M90 120 Q100 120 110 120" stroke="#111827" strokeWidth="4" fill="none" strokeLinecap="round" />
            </g>
         )}
         {config.expression === 'surprised' && (
            <g>
               <circle cx="80" cy="90" r="5" fill="#111827" />
               <circle cx="120" cy="90" r="5" fill="#111827" />
               <circle cx="100" cy="120" r="8" fill="#111827" />
            </g>
         )}
         {config.expression === 'neutral' && (
            <g>
               <rect x="75" y="88" width="10" height="4" rx="2" fill="#111827" />
               <rect x="115" y="88" width="10" height="4" rx="2" fill="#111827" />
               <line x1="90" y1="120" x2="110" y2="120" stroke="#111827" strokeWidth="4" strokeLinecap="round" />
            </g>
         )}

         {/* Hats */}
         {config.hatType === 'cap' && (
            <g transform="translate(0, -10)">
               <path d="M50 60 Q100 10 150 60" fill="#EF4444" />
               <rect x="50" y="55" width="100" height="20" rx="5" fill="#DC2626" />
               <path d="M140 60 L170 60 L160 70 L140 70 Z" fill="#DC2626" />
            </g>
         )}
         {config.hatType === 'beanie' && (
            <g>
               <path d="M55 60 Q100 0 145 60 L145 70 Q100 80 55 70 Z" fill="#F59E0B" />
               <circle cx="100" cy="30" r="10" fill="#D97706" />
            </g>
         )}
         {config.hatType === 'crown' && (
            <g transform="translate(0, -20)">
               <path d="M60 60 L80 30 L100 60 L120 30 L140 60 L140 80 L60 80 Z" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2" />
            </g>
         )}
         {config.hatType === 'headset' && (
            <g>
               <path d="M50 100 Q40 50 100 50 Q160 50 150 100" stroke="#111827" strokeWidth="6" fill="none" />
               <rect x="40" y="90" width="20" height="30" rx="5" fill="#374151" />
               <rect x="140" y="90" width="20" height="30" rx="5" fill="#374151" />
               <line x1="150" y1="120" x2="130" y2="130" stroke="#111827" strokeWidth="4" />
               <circle cx="130" cy="130" r="4" fill="#111827" />
            </g>
         )}
      </svg>
   );
};

export default AvatarBuilder;