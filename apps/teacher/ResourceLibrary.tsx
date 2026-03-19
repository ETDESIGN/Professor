
import React, { useState } from 'react';
import { Search, Filter, Image as ImageIcon, Music, Video, Plus, MoreVertical, Play, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ResourceLibrary: React.FC = () => {
   const [filter, setFilter] = useState('all');

   const resources = [
      { id: 1, type: 'image', title: 'Jungle Background', date: '2 days ago', size: '2.4 MB', url: 'https://img.freepik.com/free-vector/jungle-landscape-background_1308-49033.jpg' },
      { id: 2, type: 'audio', title: 'Animal Sounds Mix', date: '1 week ago', size: '4.1 MB', duration: '2:15' },
      { id: 3, type: 'video', title: 'The Solar System', date: '1 week ago', size: '156 MB', duration: '5:30', thumb: 'https://api.dicebear.com/7.x/shapes/svg?seed=space&backgroundColor=b6e3f4,c0aede' },
      { id: 4, type: 'image', title: 'Astronaut Character', date: '2 weeks ago', size: '1.2 MB', url: 'https://img.freepik.com/free-vector/cute-astronaut-flying-space-cartoon-vector-icon-illustration-science-technology-icon-isolated_138676-5130.jpg' },
      { id: 5, type: 'audio', title: 'Pronunciation: Th', date: '3 weeks ago', size: '0.5 MB', duration: '0:45' },
      { id: 6, type: 'image', title: 'School Bus Vector', date: '1 month ago', size: '0.8 MB', url: 'https://img.freepik.com/free-vector/yellow-school-bus-isolated-white-background_1308-46638.jpg' },
   ];

   const filteredResources = filter === 'all' ? resources : resources.filter(r => r.type === filter);

   return (
      <div className="flex-1 p-8 overflow-auto bg-slate-50">
         <header className="flex justify-between items-center mb-8">
            <div>
               <h1 className="text-2xl font-bold text-slate-800">Resource Library</h1>
               <p className="text-slate-500">Manage your global assets and media.</p>
            </div>
            <button className="bg-teacher-primary hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all">
               <Plus size={20} /> Upload Asset
            </button>
         </header>

         {/* Toolbar */}
         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
               <input
                  type="text"
                  placeholder="Search resources..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
               />
            </div>

            <div className="flex gap-2">
               {['all', 'image', 'video', 'audio'].map(type => (
                  <button
                     key={type}
                     onClick={() => setFilter(type)}
                     className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-colors ${filter === type ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                     {type}
                  </button>
               ))}
            </div>
         </div>

         {/* Grid */}
         <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
               {filteredResources.map((item, index) => (
                  <motion.div
                     layout
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.9 }}
                     transition={{ duration: 0.2, delay: index * 0.05 }}
                     key={item.id}
                     className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group"
                  >
                     {/* Preview */}
                     <div className="aspect-video bg-slate-100 relative overflow-hidden flex items-center justify-center">
                        {item.type === 'image' && <img src={item.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={item.title} />}
                        {item.type === 'video' && (
                           <>
                              <img src={item.thumb} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-80" alt={item.title} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                 <div className="w-12 h-12 bg-white/30 backdrop-blur rounded-full flex items-center justify-center shadow-lg">
                                    <Play size={24} fill="white" className="text-white ml-1" />
                                 </div>
                              </div>
                           </>
                        )}
                        {item.type === 'audio' && (
                           <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-50 text-indigo-400 group-hover:bg-indigo-100 transition-colors">
                              <Music size={48} />
                           </div>
                        )}

                        {/* Overlay Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                           <button className="p-2 bg-white rounded-full text-slate-800 hover:text-blue-600"><Download size={18} /></button>
                           <button className="p-2 bg-white rounded-full text-slate-800 hover:text-blue-600"><Plus size={18} /></button>
                        </div>
                     </div>

                     {/* Meta */}
                     <div className="p-4">
                        <div className="flex justify-between items-start mb-1">
                           <h3 className="font-bold text-slate-800 truncate pr-2">{item.title}</h3>
                           <button className="text-slate-400 hover:text-slate-600"><MoreVertical size={16} /></button>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                           <span className="uppercase font-bold tracking-wider">{item.type}</span>
                           <span>{item.size}</span>
                        </div>
                     </div>
                  </motion.div>
               ))}
            </AnimatePresence>
         </motion.div>
      </div>
   );
};

export default ResourceLibrary;
