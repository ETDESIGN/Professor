
import React, { useState, useEffect } from 'react';
import { Search, Filter, Grid, List, MoreVertical, Edit2, Play, BookOpen, Users, CalendarPlus, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';
import UnitPreviewModal from './UnitPreviewModal';
import GenerateLessonModal from './GenerateLessonModal';
import { useSession } from '../../store/SessionContext';

interface UnitListProps {
  onNewUnit: () => void;
  onEditUnit?: () => void;
  onPlanLesson?: () => void;
  onLaunchLesson?: () => void; 
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const UnitList: React.FC<UnitListProps> = ({ onNewUnit, onEditUnit, onPlanLesson, onLaunchLesson }) => {
  const { state, loadUnits, setActiveUnit, startSession, goToSlide } = useSession();
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Ensure we have fresh data on mount
  useEffect(() => {
    loadUnits();
  }, []);

  const handleLaunch = async (unit: any) => {
    await setActiveUnit(unit.id);
    startSession();
    goToSlide(0); // Jump to intro
    onLaunchLesson?.();
  };

  const handlePlan = (unit: any) => {
    setIsLoading(true);
    // Simulate loading/preparing the studio
    setTimeout(async () => {
       await setActiveUnit(unit.id);
       setIsLoading(false);
       onPlanLesson?.(); // Navigate to Studio
    }, 500);
  };

  const handleEditEnrichment = async (unit: any) => {
     await setActiveUnit(unit.id);
     // If the unit is "Processing" or "Draft", we might want to go to Enrichment view
     // For now, let's map this to the EditUnit callback which usually routes to enrichment or studio
     onEditUnit?.();
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Curriculum Units</h1>
          <p className="text-slate-500">Manage your lessons and source material</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={() => setShowGenerateModal(true)}
             className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95"
           >
             <Wand2 size={20} /> Generate Lesson
           </button>
           <button 
             onClick={onNewUnit}
             className="bg-teacher-primary hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all active:scale-95"
           >
             <span className="text-xl">+</span> New Unit
           </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search units..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" 
          />
        </div>
        
        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
          <Filter size={20} className="text-slate-400" />
          <select className="border-none bg-transparent font-medium text-slate-600 focus:ring-0 cursor-pointer">
            <option>All Levels</option>
            <option>Beginner (A1)</option>
            <option>Intermediate (B1)</option>
          </select>
        </div>
      </div>

      {/* Unit Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      >
        {state.units.map((unit, index) => (
          <motion.div 
            key={unit.id} 
            variants={itemVariants}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group duration-300 hover:-translate-y-1"
          >
            {/* Thumbnail Area */}
            <div className="h-48 bg-slate-100 relative overflow-hidden">
              <div className="absolute top-4 left-4 z-10">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm flex items-center gap-2
                  ${unit.status === 'Active' ? 'bg-green-100 text-green-700' : 
                    unit.status === 'Completed' ? 'bg-blue-100 text-blue-700' :
                    unit.status === 'Processing' ? 'bg-purple-100 text-purple-700 animate-pulse' :
                    unit.status === 'Locked' ? 'bg-slate-200 text-slate-600' : 'bg-yellow-100 text-yellow-700'
                  }
                `}>
                  {unit.status === 'Processing' && <Sparkles size={12} />}
                  {unit.status}
                </span>
              </div>
              
              <img 
                src={unit.coverImage} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                alt="Cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60"></div>

              {/* Hover Actions */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-sm gap-3">
                 <button 
                   onClick={() => handlePlan(unit)}
                   className="bg-white text-slate-800 p-3 rounded-xl font-bold hover:bg-slate-50 shadow-lg transform hover:scale-105 transition-transform flex items-center gap-2"
                   title="Edit Lesson Plan"
                 >
                   {isLoading ? <Loader2 size={20} className="animate-spin" /> : <CalendarPlus size={20} />}
                   <span className="text-xs">Plan</span>
                 </button>
                 <button 
                   onClick={() => handleLaunch(unit)}
                   className="bg-teacher-primary text-white p-3 rounded-xl font-bold hover:bg-emerald-500 shadow-lg transform hover:scale-105 transition-transform flex items-center gap-2"
                   title="Launch Class"
                 >
                   <Play size={20} />
                   <span className="text-xs">Teach</span>
                 </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-5">
              <div className="flex justify-between items-start mb-2">
                 <div>
                   <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase mb-2 inline-block bg-slate-100 text-slate-600">
                     {unit.level}
                   </span>
                   <h3 className="text-xl font-display font-bold text-slate-800 leading-tight">{unit.title}</h3>
                 </div>
                 <button className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100">
                   <MoreVertical size={20} />
                 </button>
              </div>
              
              {/* Contextual Stats based on Status */}
              {unit.status === 'Processing' ? (
                 <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mt-4">
                    <div className="text-xs font-bold text-purple-700 flex items-center gap-2 mb-1">
                       <Loader2 size={12} className="animate-spin" /> AI Analyzing...
                    </div>
                    <div className="w-full h-1.5 bg-purple-200 rounded-full overflow-hidden">
                       <div className="h-full bg-purple-500 w-2/3 animate-pulse"></div>
                    </div>
                 </div>
              ) : (
                 <div className="flex items-center gap-4 text-xs font-bold text-slate-500 border-t border-slate-100 pt-4 mt-4">
                   <div className="flex items-center gap-1.5">
                     <BookOpen size={16} className="text-slate-400" />
                     {unit.flow ? unit.flow.length : 0} Slides
                   </div>
                   <div className="flex items-center gap-1.5">
                     <Users size={16} className="text-slate-400" />
                     Class 3B
                   </div>
                   <div className="ml-auto text-slate-400 font-normal">
                     {unit.lastUpdated}
                   </div>
                 </div>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>
      
      {/* Preview Modal */}
      {selectedUnit && (
        <UnitPreviewModal 
          unit={selectedUnit} 
          onClose={() => setSelectedUnit(null)}
          onLaunch={() => {
             setSelectedUnit(null);
             handleLaunch(selectedUnit);
          }}
          onEdit={() => {
             setSelectedUnit(null);
             handlePlan(selectedUnit);
          }}
        />
      )}

      {/* Generate Lesson Modal */}
      {showGenerateModal && (
        <GenerateLessonModal 
          onClose={() => setShowGenerateModal(false)}
          onSuccess={(unitId) => {
            setShowGenerateModal(false);
            // Optionally, we could automatically select the new unit or open it
          }}
        />
      )}
    </div>
  );
};

export default UnitList;
