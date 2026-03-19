import React, { useState } from 'react';
import { ChevronLeft, Volume2, X, ArrowRight, BookOpen, CheckCircle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReadingReaderProps {
  onBack: () => void;
}

const ReadingReader: React.FC<ReadingReaderProps> = ({ onBack }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedWord, setSelectedWord] = useState<any | null>(null);
  const [quizAnswered, setQuizAnswered] = useState<string | null>(null);

  const story = {
    title: "The Lost Hat",
    level: "Level 1",
    pages: [
      {
        image: "https://img.freepik.com/free-vector/park-scene-with-trees-bench_1308-46638.jpg",
        text: [
          { t: "It is a " }, { t: "sunny", vocab: true, def: "Bright with sunlight", trans: "Soleado" }, { t: " day in the " }, { t: "park", vocab: true, def: "A public green area", trans: "Parque" }, { t: "." }
        ]
      },
      {
        image: "https://img.freepik.com/free-vector/robot-character-isolated_1308-41315.jpg",
        text: [
          { t: "Rocky the " }, { t: "robot", vocab: true, def: "A machine that moves", trans: "Robot" }, { t: " looks for his " }, { t: "red", vocab: true, def: "A primary color", trans: "Rojo" }, { t: " hat." }
        ]
      },
      {
        image: "https://img.freepik.com/free-vector/cute-monkey-hanging-tree-cartoon-vector-icon-illustration_138676-2226.jpg",
        text: [
          { t: "Is it on the " }, { t: "tree", vocab: true, def: "A tall woody plant", trans: "Árbol" }, { t: "? No, a " }, { t: "monkey", vocab: true, def: "A primate animal", trans: "Mono" }, { t: " has it!" }
        ]
      }
    ]
  };

  const handleWordClick = (segment: any) => {
    if (segment.vocab) {
      setSelectedWord(segment);
    }
  };

  const handleNext = () => {
    if (currentPage < story.pages.length) {
      setCurrentPage(p => p + 1);
    }
  };

  const handleFinish = () => {
    onBack();
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full">
           <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
           <span className="font-bold text-slate-800 text-sm">{story.title}</span>
           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{story.level}</span>
        </div>
        <button className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
           <BookOpen size={24} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-24">
         <AnimatePresence mode="wait">
         {/* Quiz Phase */}
         {currentPage === story.pages.length ? (
            <motion.div 
               key="quiz"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="p-6 flex flex-col h-full items-center justify-center"
            >
               <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-6">
                  <HelpCircle size={40} />
               </div>
               <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Quick Check</h2>
               <p className="text-slate-500 mb-8 text-center">Who had Rocky's hat?</p>
               
               <div className="w-full space-y-3">
                  {['The Lion', 'The Monkey', 'The Teacher'].map((opt) => (
                     <button 
                        key={opt}
                        onClick={() => setQuizAnswered(opt)}
                        className={`w-full p-4 rounded-xl font-bold text-left border-2 transition-all ${
                           quizAnswered === opt 
                              ? (opt === 'The Monkey' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-red-50 border-red-500 text-red-700')
                              : 'bg-white border-slate-200 text-slate-700 hover:border-purple-300'
                        }`}
                     >
                        {opt}
                        {quizAnswered === opt && (
                           <span className="float-right">
                              {opt === 'The Monkey' ? <CheckCircle size={20} /> : <X size={20} />}
                           </span>
                        )}
                     </button>
                  ))}
               </div>

               {quizAnswered === 'The Monkey' && (
                  <button 
                     onClick={handleFinish}
                     className="mt-8 w-full bg-duo-green text-white font-bold py-4 rounded-xl shadow-lg animate-bounce-subtle"
                  >
                     Complete Story
                  </button>
               )}
            </motion.div>
         ) : (
            // Reading Phase
            <motion.div 
               key={`page-${currentPage}`}
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="flex flex-col h-full"
            >
               <div className="aspect-video w-full bg-slate-200 relative overflow-hidden shadow-sm">
                  <img 
                     src={story.pages[currentPage].image} 
                     alt="Story Scene" 
                     className="w-full h-full object-cover animate-scale-in" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
               </div>

               <div className="flex-1 p-8 flex items-center justify-center">
                  <p className="text-2xl font-medium text-slate-800 leading-relaxed text-center">
                     {story.pages[currentPage].text.map((segment, i) => (
                        <span 
                           key={i}
                           onClick={() => handleWordClick(segment)}
                           className={`
                              ${segment.vocab ? 'text-duo-blue font-bold cursor-pointer border-b-2 border-duo-blue/30 hover:bg-blue-50 rounded px-1 transition-colors' : ''}
                              ${selectedWord === segment ? 'bg-blue-100 text-duo-blue border-duo-blue' : ''}
                           `}
                        >
                           {segment.t}
                        </span>
                     ))}
                  </p>
               </div>
            </motion.div>
         )}
         </AnimatePresence>
      </div>

      {/* Footer Navigation */}
      {currentPage < story.pages.length && (
         <div className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-slate-200 z-10 flex items-center justify-between">
            <div className="flex gap-1">
               {story.pages.map((_, i) => (
                  <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === currentPage ? 'w-8 bg-duo-blue' : 'w-2 bg-slate-200'}`}></div>
               ))}
               <div className="w-2 h-2 rounded-full bg-slate-200"></div> {/* Quiz dot */}
            </div>
            <button 
               onClick={handleNext}
               className="bg-duo-blue text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-blue-500 active:scale-95 transition-all flex items-center gap-2"
            >
               Next <ArrowRight size={20} />
            </button>
         </div>
      )}

      {/* Definition Sheet */}
      <AnimatePresence>
      {selectedWord && (
         <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-end"
         >
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
            <motion.div 
               initial={{ y: '100%' }}
               animate={{ y: 0 }}
               exit={{ y: '100%' }}
               transition={{ type: "spring", damping: 25, stiffness: 200 }}
               className="bg-white w-full p-6 rounded-t-3xl shadow-2xl relative z-40"
            >
               <button onClick={() => setSelectedWord(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                  <X size={24} />
               </button>
               
               <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-blue-50 text-duo-blue rounded-2xl flex items-center justify-center border-2 border-blue-100">
                     <Volume2 size={32} />
                  </div>
                  <div>
                     <h3 className="text-3xl font-bold text-slate-800">{selectedWord.t.trim()}</h3>
                     <p className="text-slate-400 font-mono text-sm">/phonetic/</p>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                     <span className="text-xs font-bold text-slate-400 uppercase">Definition</span>
                     <p className="text-lg text-slate-700 font-medium">{selectedWord.def}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                     <span className="text-xs font-bold text-slate-400 uppercase">Translation</span>
                     <p className="text-lg text-duo-blue font-bold">{selectedWord.trans}</p>
                  </div>
               </div>
            </motion.div>
         </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default ReadingReader;