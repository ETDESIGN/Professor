import React from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LogOut, Building2, Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useAppStore } from '../../store/useAppStore';

const DistrictAdminDashboard: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
                <div className="p-6">
                    <h2 className="text-xl font-bold font-display text-slate-800 flex items-center gap-2">
                        <Building2 className="text-indigo-600" />
                        Admin Portal
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Springfield District</p>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    <button className="w-full flex items-center gap-3 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium">
                        <Building2 size={18} />
                        Schools
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
                        <Users size={18} />
                        Staff Management
                    </button>
                </nav>

                <div className="p-4 border-t border-slate-200">
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            useAppStore.getState().clearUserProfile();
                            window.location.assign(window.location.origin);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="font-medium text-sm">Sign Out</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="bg-white border-b border-slate-200 p-6 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-slate-800">District Overview</h1>
                    <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700">
                        + New School
                    </button>
                </header>

                <main className="flex-1 p-8 overflow-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="text-slate-500 text-sm font-medium mb-1">Total Schools</div>
                            <div className="text-3xl font-bold text-slate-800">4</div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="text-slate-500 text-sm font-medium mb-1">Active Teachers</div>
                            <div className="text-3xl font-bold text-slate-800">42</div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="text-slate-500 text-sm font-medium mb-1">Total Students</div>
                            <div className="text-3xl font-bold text-slate-800">1,204</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-800">Managed Schools</h3>
                        </div>
                        <div className="p-6 flex flex-col items-center justify-center text-center text-slate-500">
                            <Building2 size={48} className="text-slate-300 mb-4" />
                            <p>No schools created yet.</p>
                            <p className="text-sm">Click "+ New School" to start building your district.</p>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DistrictAdminDashboard;
