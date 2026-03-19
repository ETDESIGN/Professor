import React, { useState } from 'react';
import { ChevronLeft, Plus, Search, Book, Play, Music, Mic, Layers, Save, Clock, MoreVertical, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface TimelineItem {
  id: string;
  type: string;
  title: string;
  duration: number;
  category: 'core' | 'game' | 'media';
}

const LessonTimelineBuilder: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [timeline, setTimeline] = useState<TimelineItem[]>([
    { id: 't1', type: 'WARM_UP', title: 'Welcome Song', duration: 5, category: 'media' },
    { id: 't2', type: 'VOCAB', title: 'New Words: Jungle', duration: 10, category: 'core' }
  ]);

  const libraryItems: Omit<TimelineItem, 'id'>[] = [
    { type: 'WARM_UP', title: 'Warm-up Song', duration: 5, category: 'media' },
    { type: 'VOCAB', title: 'Vocabulary Intro', duration: 10, category: 'core' },
    { type: 'GRAMMAR', title: 'Grammar Focus', duration: 15, category: 'core' },
    { type: 'READING', title: 'Story Time', duration: 15, category: 'core' },
    { type: 'GAME_TEAM', title: 'Team Battle', duration: 10, category: 'game' },
    { type: 'GAME_QUIZ', title: 'Speed Quiz', duration: 5, category: 'game' },
    { type: 'SPEAKING', title: 'Roleplay', duration: 15, category: 'core' },
  ];

  const addToTimeline = (item: Omit<TimelineItem, 'id'>, index?: number) => {
    const newItem = { ...item, id: `item-${Date.now()}-${Math.random()}` };
    if (typeof index === 'number') {
      const newTimeline = [...timeline];
      newTimeline.splice(index, 0, newItem);
      setTimeline(newTimeline);
    } else {
      setTimeline([...timeline, newItem]);
    }
  };

  const removeFromTimeline = (id: string) => {
    setTimeline(timeline.filter(t => t.id !== id));
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    // Dropped outside a list
    if (!destination) {
      return;
    }

    if (source.droppableId === 'library' && destination.droppableId === 'timeline') {
      // Dragged from library to timeline
      const item = libraryItems[source.index];
      addToTimeline(item, destination.index);
    } else if (source.droppableId === 'timeline' && destination.droppableId === 'timeline') {
      // Reordered within timeline
      const items = Array.from(timeline);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);
      setTimeline(items);
    }
  };

  const totalDuration = timeline.reduce((acc, curr) => acc + curr.duration, 0);

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      {/* Top Nav */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="font-bold text-slate-800">New Lesson Plan</h1>
            <p className="text-xs text-slate-500">Drag & Drop Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className={`px-4 py-2 rounded-lg font-mono font-bold text-sm flex items-center gap-2 ${totalDuration > 45 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
              <Clock size={16} /> {totalDuration} / 45 min
           </div>
           <button className="bg-teacher-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-500 shadow-md shadow-emerald-200 flex items-center gap-2">
              <Save size={18} /> Save Lesson
           </button>
        </div>
      </header>

      {/* Main Workspace */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 flex overflow-hidden">
           
           {/* Sidebar Library */}
           <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-100">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" placeholder="Search activities..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                 </div>
              </div>
              
              <Droppable droppableId="library" isDropDisabled={true}>
                {(provided) => (
                  <div 
                    className="flex-1 overflow-y-auto p-4 space-y-6"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                     <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Core Modules</h3>
                        <div className="space-y-2">
                           {libraryItems.map((item, idx) => {
                              if (item.category !== 'core') return null;
                              return (
                                <Draggable key={`lib-${idx}`} draggableId={`lib-${idx}`} index={idx}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.5 : 1 }}
                                    >
                                      <LibraryCard item={item} onAdd={() => addToTimeline(item)} />
                                    </div>
                                  )}
                                </Draggable>
                              );
                           })}
                        </div>
                     </div>
                     <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Gamification</h3>
                        <div className="space-y-2">
                           {libraryItems.map((item, idx) => {
                              if (item.category !== 'game') return null;
                              return (
                                <Draggable key={`lib-${idx}`} draggableId={`lib-${idx}`} index={idx}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.5 : 1 }}
                                    >
                                      <LibraryCard item={item} onAdd={() => addToTimeline(item)} />
                                    </div>
                                  )}
                                </Draggable>
                              );
                           })}
                        </div>
                     </div>
                     <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Media</h3>
                        <div className="space-y-2">
                           {libraryItems.map((item, idx) => {
                              if (item.category !== 'media') return null;
                              return (
                                <Draggable key={`lib-${idx}`} draggableId={`lib-${idx}`} index={idx}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.5 : 1 }}
                                    >
                                      <LibraryCard item={item} onAdd={() => addToTimeline(item)} />
                                    </div>
                                  )}
                                </Draggable>
                              );
                           })}
                        </div>
                     </div>
                     {provided.placeholder}
                  </div>
                )}
              </Droppable>
           </div>

           {/* Timeline Canvas */}
           <div className="flex-1 bg-slate-50 overflow-y-auto p-8 flex justify-center">
              <div className="w-full max-w-2xl relative pb-20">
                 {/* Vertical Line */}
                 <div className="absolute top-0 bottom-0 left-8 w-0.5 bg-slate-200 z-0"></div>

                 <Droppable droppableId="timeline">
                   {(provided, snapshot) => (
                     <div 
                       ref={provided.innerRef}
                       {...provided.droppableProps}
                       className={`min-h-[200px] ${snapshot.isDraggingOver ? 'bg-slate-100/50 rounded-xl' : ''}`}
                     >
                       {timeline.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => (
                              <div 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`relative pl-16 mb-6 group animate-slide-up ${snapshot.isDragging ? 'z-50' : ''}`}
                                style={provided.draggableProps.style}
                              >
                                 {/* Step Number */}
                                 <div className="absolute left-4 top-6 w-8 h-8 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center font-bold text-sm text-slate-500 z-10 shadow-sm">
                                    {index + 1}
                                 </div>

                                 {/* Card */}
                                 <div className={`bg-white p-4 rounded-xl border ${snapshot.isDragging ? 'border-indigo-500 shadow-xl' : 'border-slate-200 shadow-sm'} hover:shadow-md transition-shadow group-hover:border-slate-300`}>
                                    <div className="flex justify-between items-start">
                                       <div className="flex items-center gap-3">
                                          <div className={`p-3 rounded-lg ${
                                             item.category === 'game' ? 'bg-purple-100 text-purple-600' :
                                             item.category === 'media' ? 'bg-blue-100 text-blue-600' :
                                             'bg-emerald-100 text-emerald-600'
                                          }`}>
                                             {item.category === 'game' ? <Layers size={20} /> : item.category === 'media' ? <Play size={20} /> : <Book size={20} />}
                                          </div>
                                          <div>
                                             <h3 className="font-bold text-slate-800">{item.title}</h3>
                                             <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{item.type.replace('_', ' ')}</span>
                                          </div>
                                       </div>
                                       <div className="flex items-center gap-2">
                                          <span className="text-sm font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">{item.duration}m</span>
                                          <button 
                                             onClick={() => removeFromTimeline(item.id)}
                                             className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                          >
                                             <X size={18} />
                                          </button>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                            )}
                          </Draggable>
                       ))}
                       {provided.placeholder}
                     </div>
                   )}
                 </Droppable>

                 {/* Drop Zone */}
                 <div className="pl-16 mt-4">
                    <div className="h-24 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-50/50">
                       <span className="text-sm font-bold">Add next activity</span>
                       <span className="text-xs">Drag from library or click +</span>
                    </div>
                 </div>

              </div>
           </div>

        </div>
      </DragDropContext>
    </div>
  );
};

const LibraryCard: React.FC<{ item: any; onAdd: () => void }> = ({ item, onAdd }) => (
   <div className="w-full text-left bg-white p-3 rounded-xl border border-slate-200 hover:border-teacher-primary hover:shadow-sm transition-all group flex items-center justify-between cursor-grab active:cursor-grabbing">
      <div className="flex items-center gap-3">
         <div className={`p-2 rounded-lg ${
            item.category === 'game' ? 'bg-purple-50 text-purple-500' :
            item.category === 'media' ? 'bg-blue-50 text-blue-500' :
            'bg-emerald-50 text-emerald-500'
         }`}>
            {item.category === 'game' ? <Layers size={16} /> : item.category === 'media' ? <Play size={16} /> : <Book size={16} />}
         </div>
         <div>
            <div className="font-bold text-sm text-slate-700">{item.title}</div>
            <div className="text-[10px] text-slate-400 font-bold">{item.duration}m</div>
         </div>
      </div>
      <button onClick={onAdd} className="p-1 hover:bg-slate-100 rounded">
        <Plus size={16} className="text-slate-300 group-hover:text-teacher-primary" />
      </button>
   </div>
);

export default LessonTimelineBuilder;