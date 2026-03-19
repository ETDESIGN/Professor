import React, { useState, useEffect } from 'react';
import { History, Check, RefreshCcw, ArrowRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

interface StoryCard {
  id: string;
  image: string;
  text: string;
  order: number;
}

const BoardStorySequencing = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [cards, setCards] = useState<StoryCard[]>([]);
  const [slots, setSlots] = useState<(StoryCard | null)[]>([]);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    initializeGame();
  }, [data]);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
       initializeGame();
    } else if (state.lastAction?.type === 'CHECK_ANSWER') {
       checkOrder();
    }
  }, [state.lastAction]);

  const initializeGame = () => {
    const items: StoryCard[] = data.cards.map((c: any, i: number) => ({ ...c, order: i }));
    setCards([...items].sort(() => Math.random() - 0.5));
    setSlots(new Array(items.length).fill(null));
    setIsCorrect(false);
  };

  const handleCardClick = (card: StoryCard) => {
    // Find first empty slot
    const firstEmptyIndex = slots.findIndex(s => s === null);
    if (firstEmptyIndex !== -1) {
      const newSlots = [...slots];
      newSlots[firstEmptyIndex] = card;
      setSlots(newSlots);
      setCards(cards.filter(c => c.id !== card.id));
    }
  };

  const handleSlotClick = (index: number) => {
    const card = slots[index];
    if (card) {
      setCards([...cards, card]);
      const newSlots = [...slots];
      newSlots[index] = null;
      setSlots(newSlots);
      setIsCorrect(false);
    }
  };

  const checkOrder = () => {
    const isFull = slots.every(s => s !== null);
    if (!isFull) return;

    const correct = slots.every((s, i) => s?.order === i);
    if (correct) {
      setIsCorrect(true);
    } else {
      // Simple error handling: reset incorrect ones
      const newSlots = slots.map((s, i) => (s?.order === i ? s : null));
      const returnedCards = slots.filter((s, i) => s && s.order !== i) as StoryCard[];
      setSlots(newSlots);
      setCards([...cards, ...returnedCards]);
    }
  };

  return (
    <div className="h-full bg-slate-100 flex flex-col p-8 font-sans">
      <div className="flex justify-between items-center mb-6">
         <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
               <History size={28} />
            </div>
            <div>
               <h1 className="text-3xl font-bold text-slate-800">Story Sequencing</h1>
               <p className="text-slate-500">Put the events in the correct order.</p>
            </div>
         </div>
         <div className="flex gap-3">
            <button onClick={initializeGame} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
               <RefreshCcw />
            </button>
            <button 
               onClick={checkOrder}
               className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2 ${slots.every(s => s) ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-300 cursor-not-allowed'}`}
            >
               Check Answer <ArrowRight size={20} />
            </button>
         </div>
      </div>

      {/* Timeline Slots */}
      <div className="flex-1 flex flex-col justify-center gap-8">
         
         {/* Drop Zones */}
         <div className="flex gap-4 justify-center items-stretch h-64">
            {slots.map((slot, i) => (
               <div 
                  key={i}
                  onClick={() => handleSlotClick(i)}
                  className={`
                     flex-1 max-w-xs rounded-2xl border-4 transition-all relative group cursor-pointer
                     ${slot ? 'border-purple-600 bg-white shadow-xl rotate-0' : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100'}
                     ${isCorrect && slot ? 'ring-4 ring-green-400 border-green-500' : ''}
                  `}
               >
                  {slot ? (
                     <div className="w-full h-full p-2 flex flex-col">
                        <img src={slot.image} className="w-full h-40 object-cover rounded-xl mb-3" />
                        <p className="text-center font-bold text-slate-700 leading-tight">{slot.text}</p>
                        <div className="absolute -top-4 -left-4 w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-xl border-4 border-slate-100 shadow-md">
                           {i + 1}
                        </div>
                     </div>
                  ) : (
                     <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-6xl font-black opacity-20">
                        {i + 1}
                     </div>
                  )}
               </div>
            ))}
         </div>

         {/* Arrow Divider */}
         <div className="flex items-center justify-center text-slate-300">
            <div className="h-1 bg-slate-200 flex-1 max-w-xl rounded-full"></div>
         </div>

         {/* Source Cards */}
         <div className="flex gap-4 justify-center flex-wrap h-48 content-center">
            {cards.map((card) => (
               <button
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  className="w-48 bg-white rounded-xl shadow-md border border-slate-200 p-2 hover:-translate-y-2 transition-transform hover:shadow-xl group text-left"
               >
                  <div className="h-24 overflow-hidden rounded-lg mb-2 relative">
                     <img src={card.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                  </div>
                  <p className="text-xs font-bold text-slate-600 line-clamp-2">{card.text}</p>
               </button>
            ))}
            {cards.length === 0 && !isCorrect && (
               <div className="text-slate-400 font-bold animate-pulse">Tap "Check Answer" when ready!</div>
            )}
            {isCorrect && (
               <div className="flex items-center gap-2 text-green-600 font-bold text-2xl animate-bounce">
                  <Check size={32} /> Correct Sequence!
               </div>
            )}
         </div>

      </div>
    </div>
  );
};

export default BoardStorySequencing;