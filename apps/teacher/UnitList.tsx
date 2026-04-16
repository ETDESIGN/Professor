
import React, { useState, useEffect } from 'react';
import { Search, Filter, Grid, List, MoreVertical, Edit2, Play, BookOpen, Users, CalendarPlus, Loader2, Sparkles, Wand2, Upload, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import UnitPreviewModal from './UnitPreviewModal';
import { useSession } from '../../store/SessionContext';
import toast from 'react-hot-toast';

interface UnitListProps {
  onNewUnit: () => void;
  onUploadMaterial?: () => void;
  onEditUnit?: (unitId: string) => void;
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

const UnitList: React.FC<UnitListProps> = ({ onNewUnit, onUploadMaterial, onEditUnit, onPlanLesson, onLaunchLesson }) => {
  const { state, loadUnits, setActiveUnit, startSession, goToSlide } = useSession();
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);

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
     onEditUnit?.(unit.id);
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
             onClick={() => setShowNewUnitModal(true)}
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

      {/* Generate Lesson Modal — Deprecated: redirects to upload */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Lesson Generation</h2>
            <p className="text-slate-600 mb-6">Upload textbook pages to generate AI-powered lessons.</p>
            <button
              onClick={() => {
                setShowGenerateModal(false);
                if (onUploadMaterial) onUploadMaterial();
              }}
              className="px-6 py-3 bg-teacher-primary text-white font-bold rounded-lg"
            >
              Go to Upload Workspace
            </button>
            <button
              onClick={() => setShowGenerateModal(false)}
              className="ml-3 px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New Unit Options Modal */}
      <AnimatePresence>
        {showNewUnitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
            onClick={() => setShowNewUnitModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-800">Create New Unit</h2>
                <p className="text-slate-500 text-sm mt-1">Choose how you want to create your lesson</p>
              </div>
              
              <div className="p-6 space-y-4">
                <button
                  onClick={() => {
                    setShowNewUnitModal(false);
                    onNewUnit?.();
                  }}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-purple-500 hover:bg-purple-50 transition-all flex items-center gap-4 text-left group"
                >
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 group-hover:bg-purple-500 group-hover:text-white transition-all">
                    <Wand2 size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Generate from Topic</h3>
                    <p className="text-sm text-slate-500">Enter a topic and let AI create a lesson</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setShowNewUnitModal(false);
                    onUploadMaterial?.();
                  }}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center gap-4 text-left group"
                >
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <Upload size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Upload Material</h3>
                    <p className="text-sm text-slate-500">Upload PDF or images for AI to analyze</p>
                  </div>
                </button>
              </div>

              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowNewUnitModal(false)}
                  className="w-full py-2 text-slate-500 font-medium hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UnitList;
