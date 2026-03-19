import React from 'react';
import { Layout, Monitor, Smartphone, Users, Baby, Zap } from 'lucide-react';

interface HubProps {
  onSelectApp: (app: string) => void;
}

const Hub: React.FC<HubProps> = ({ onSelectApp }) => {
  const apps = [
    { id: 'onboarding-teacher', name: 'Teacher Onboarding', icon: Layout, desc: 'Setup School & Class', color: 'bg-emerald-600' },
    { id: 'onboarding-student', name: 'Student Onboarding', icon: Users, desc: 'Join Class with Code', color: 'bg-lime-600' },
    { id: 'onboarding-parent', name: 'Parent Onboarding', icon: Baby, desc: 'Link Child with Code', color: 'bg-rose-500' },
    { id: 'admin-portal', name: 'Admin Portal', icon: Layout, desc: 'School Management', color: 'bg-slate-700' },
    { id: 'teacher-studio', name: 'Teacher Studio', icon: Layout, desc: 'Lesson Prep & Orchestration', color: 'bg-emerald-500' },
    { id: 'teacher-live-commander', name: 'Teacher Commander', icon: Zap, desc: 'Web Live Control (Desktop)', color: 'bg-indigo-600' },
    { id: 'classroom-board', name: 'Classroom Board', icon: Monitor, desc: 'Projector View (Student Facing)', color: 'bg-blue-600' },
    { id: 'teacher-remote', name: 'Teacher Remote', icon: Smartphone, desc: 'Mobile Remote "God Mode"', color: 'bg-indigo-500' },
    { id: 'student-app', name: 'Student App', icon: Users, desc: 'Gamified Homework PWA', color: 'bg-lime-500' },
    { id: 'parent-app', name: 'Parent App', icon: Baby, desc: 'Reporting & Dubbing Gallery', color: 'bg-cyan-500' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold text-white mb-2">Lesson Orchestrator</h1>
        <p className="text-slate-400">Select a persona to launch the prototype experience</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full">
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => onSelectApp(app.id)}
            className="group relative overflow-hidden bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl text-left"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 ${app.color} opacity-10 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 group-hover:opacity-20`}></div>

            <div className={`w-12 h-12 ${app.color} rounded-xl flex items-center justify-center mb-4 text-white shadow-lg`}>
              <app.icon size={24} />
            </div>

            <h3 className="text-xl font-bold text-white mb-1">{app.name}</h3>
            <p className="text-slate-400 text-sm">{app.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-12 text-slate-500 text-sm">
        v0.1.0 Prototype • No Backend • Mock Data
      </div>
    </div>
  );
};

export default Hub;