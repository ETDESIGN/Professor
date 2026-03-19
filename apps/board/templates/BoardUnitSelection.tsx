
import React, { useState } from 'react';
import { Search, Clock, BookOpen, Star, PlayCircle } from 'lucide-react';
import { MOCK_UNITS } from '../../../store/mockData';
import { useSession } from '../../../store/SessionContext';

const BoardUnitSelection = () => {
  const { startSession, nextSlide } = useSession();
  const [searchTerm, setSearchTerm] = useState('');
  const featuredUnit = MOCK_UNITS[0];

  const handleLaunch = () => {
    // Start the session and move to the first slide (Intro Splash)
    startSession();
    nextSlide();
  };

  const filteredUnits = MOCK_UNITS.filter(u => 
    u.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans p-12 overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-start mb-12">
         <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-duo-green rounded-3xl flex items-center justify-center shadow-xl shadow-green-200">
               <BookOpen size={40} className="text-white" />
            </div>
            <div>
               <h1 className="text-4xl font-display font-bold text-slate-800">English Level 3</h1>
               <div className="flex items-center gap-3 text-slate-500 font-medium text-xl mt-1">
                  <span>Ms. Frizzle</span>
                  <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                  <span>Room 3B</span>
               </div>
            </div>
         </div>
         <div className="flex items-center gap-4 bg-white p-2 pr-6 rounded-2xl shadow-sm border border-slate-200 w-96">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
               <Search size={24} />
            </div>
            <input 
               type="text" 
               placeholder="Search units..." 
               className="text-xl text-slate-800 placeholder:text-slate-400 bg-transparent border-none focus:ring-0 w-full font-medium"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
      </header>

      <div className="flex-1 overflow-y-auto pr-4 -mr-4 pb-8">
         {/* Featured Card */}
         {!searchTerm && (
            <div className="w-full h-80 bg-slate-900 rounded-[3rem] relative overflow-hidden shadow-2xl mb-12 group cursor-pointer" onClick={handleLaunch}>
               <img 
                  src="https://images.unsplash.com/photo-1564419434663-c49967363849?q=80&w=1920" 
                  className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000" 
                  alt="Featured" 
               />
               <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/60 to-transparent"></div>
               
               <div className="absolute inset-0 p-16 flex flex-col justify-center items-start">
                  <div className="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-sm mb-4 flex items-center gap-2">
                     <Clock size={16} /> Resume Class
                  </div>
                  <h2 className="text-6xl font-display font-bold text-white mb-4">{featuredUnit.title}</h2>
                  <div className="flex items-center gap-6 text-slate-300 text-xl font-medium mb-8">
                     <span>{featuredUnit.lessons} Lessons</span>
                     <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                     <span>{featuredUnit.level}</span>
                  </div>
                  <button 
                     onClick={(e) => {
                        e.stopPropagation();
                        handleLaunch();
                     }}
                     className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-bold text-xl flex items-center gap-3 shadow-lg hover:scale-105 transition-transform animate-pulse-slow"
                  >
                     <PlayCircle size={28} className="text-duo-green" fill="currentColor" />
                     Launch Live Mode
                  </button>
               </div>
            </div>
         )}

         {/* Grid */}
         <div>
            <div className="flex items-center gap-4 mb-6">
               <h3 className="text-2xl font-bold text-slate-800">{searchTerm ? 'Search Results' : 'All Units'}</h3>
               <div className="h-px bg-slate-200 flex-1"></div>
            </div>
            
            <div className="grid grid-cols-3 gap-8">
               {filteredUnits.map((unit, i) => (
                  <button 
                     key={unit.id} 
                     onClick={handleLaunch}
                     className="bg-white rounded-[2rem] border border-slate-200 p-4 shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 text-left group"
                  >
                     <div className="aspect-video bg-slate-100 rounded-2xl mb-4 relative overflow-hidden">
                        <img 
                           src={`https://source.unsplash.com/random/400x300?education&sig=${i}`} 
                           className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                           alt={unit.title} 
                        />
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide shadow-sm">
                           Unit {i + 1}
                        </div>
                        {unit.status === 'Locked' && (
                           <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center backdrop-blur-[2px]">
                              <div className="bg-white/20 backdrop-blur-md p-4 rounded-full border border-white/30 text-white">
                                 <div className="w-8 h-8 flex items-center justify-center text-2xl">🔒</div>
                              </div>
                           </div>
                        )}
                        {unit.status !== 'Locked' && (
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-white/20 backdrop-blur-md p-4 rounded-full border border-white/30 text-white transform scale-90 group-hover:scale-100 transition-transform">
                                 <PlayCircle size={40} fill="currentColor" />
                              </div>
                           </div>
                        )}
                     </div>
                     <div className="px-2 pb-2">
                        <h4 className="text-xl font-bold text-slate-800 mb-1 line-clamp-1">{unit.title}</h4>
                        <div className="flex justify-between items-center text-slate-500 text-sm font-medium">
                           <span>{unit.lessons} Lessons</span>
                           <div className="flex items-center gap-1 text-yellow-500">
                              <Star size={16} fill="currentColor" />
                              <Star size={16} fill="currentColor" />
                              <Star size={16} fill="currentColor" />
                           </div>
                        </div>
                     </div>
                  </button>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default BoardUnitSelection;
