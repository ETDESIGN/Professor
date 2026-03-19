
import React, { useState } from 'react';
import { Monitor, ArrowRight, QrCode, Wifi } from 'lucide-react';

interface RemoteConnectProps {
  onConnect: () => void;
}

const RemoteConnect: React.FC<RemoteConnectProps> = ({ onConnect }) => {
  const [code, setCode] = useState('');

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8 max-w-md mx-auto">
      
      <div className="flex flex-col items-center mb-12">
         <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-blue-900/50 transform rotate-3">
            <Monitor size={48} className="text-white" />
         </div>
         <h1 className="text-3xl font-display font-bold mb-2">Remote Control</h1>
         <p className="text-slate-400 text-center">Enter the room code shown on the Classroom Board.</p>
      </div>

      <div className="w-full space-y-4 mb-8">
         <div className="bg-slate-800 p-2 rounded-2xl border border-slate-700 flex items-center">
            <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center text-slate-400 font-mono font-bold">#</div>
            <input 
               type="text" 
               placeholder="Room Code" 
               value={code}
               onChange={(e) => setCode(e.target.value)}
               className="flex-1 bg-transparent border-none focus:ring-0 text-white font-bold text-xl px-4 placeholder-slate-600 uppercase tracking-widest"
            />
         </div>
         
         <button 
            onClick={onConnect}
            disabled={!code}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-lg py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3"
         >
            Connect <ArrowRight size={24} />
         </button>
      </div>

      <div className="w-full flex items-center gap-4 my-4">
         <div className="h-px bg-slate-800 flex-1"></div>
         <span className="text-slate-600 text-xs font-bold uppercase">Or</span>
         <div className="h-px bg-slate-800 flex-1"></div>
      </div>

      <button className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl border border-slate-700 transition-colors flex items-center justify-center gap-3">
         <QrCode size={20} /> Scan QR Code
      </button>

      <div className="mt-auto pt-8">
         <div className="text-slate-500 text-xs font-bold uppercase text-center mb-4">Recent Rooms</div>
         <div className="flex gap-3 justify-center">
            <button onClick={onConnect} className="bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold text-slate-300 hover:text-white border border-slate-700 flex items-center gap-2">
               <Wifi size={14} className="text-green-500" /> Room 304
            </button>
            <button onClick={onConnect} className="bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold text-slate-300 hover:text-white border border-slate-700">
               Room 101
            </button>
         </div>
      </div>

    </div>
  );
};

export default RemoteConnect;
    