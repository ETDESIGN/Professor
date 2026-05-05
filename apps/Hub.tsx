import React from 'react';
import { Layout, Monitor, Smartphone, Users, Baby, Zap, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, changeLanguage } from '../services/i18n';

interface HubProps {
  onSelectApp: (app: string) => void;
}

const Hub: React.FC<HubProps> = ({ onSelectApp }) => {
  const { t, i18n } = useTranslation();

  const apps = [
    { id: 'onboarding-teacher', name: t('hub.teacher'), icon: Layout, desc: 'Setup School & Class', color: 'bg-emerald-600' },
    { id: 'onboarding-student', name: t('hub.student'), icon: Users, desc: t('student.joinClass'), color: 'bg-lime-600' },
    { id: 'onboarding-parent', name: t('hub.parent'), icon: Baby, desc: 'Link Child with Code', color: 'bg-rose-500' },
    { id: 'admin-portal', name: t('hub.admin'), icon: Layout, desc: 'School Management', color: 'bg-slate-700' },
    { id: 'teacher-studio', name: t('teacher.lessonStudio'), icon: Layout, desc: 'Lesson Prep & Orchestration', color: 'bg-emerald-500' },
    { id: 'teacher-live-commander', name: t('teacher.liveCommander'), icon: Zap, desc: 'Web Live Control (Desktop)', color: 'bg-indigo-600' },
    { id: 'classroom-board', name: t('hub.board'), icon: Monitor, desc: 'Projector View', color: 'bg-blue-600' },
    { id: 'teacher-remote', name: t('hub.remote'), icon: Smartphone, desc: 'Mobile Remote', color: 'bg-indigo-500' },
    { id: 'student-app', name: t('hub.student'), icon: Users, desc: 'Gamified Homework PWA', color: 'bg-lime-500' },
    { id: 'parent-app', name: t('hub.parent'), icon: Baby, desc: t('parent.gallery'), color: 'bg-cyan-500' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-display font-bold text-white mb-2">{t('hub.title')}</h1>
        <p className="text-slate-400">{t('hub.subtitle')}</p>
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

      <div className="mt-8 flex items-center gap-3">
        <Globe size={16} className="text-slate-500" />
        <select
          value={i18n.language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="bg-slate-800 text-slate-300 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 text-slate-500 text-sm">
        v2.0 • Supabase + Nano Banana Pro 2 + ElevenLabs
      </div>
    </div>
  );
};

export default Hub;
