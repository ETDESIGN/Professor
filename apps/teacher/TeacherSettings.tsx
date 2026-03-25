
import React, { useState } from 'react';
import { User, Lock, Bell, Globe, Monitor, Moon, Shield, ToggleLeft, ToggleRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';

const TeacherSettings: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'profile' | 'school' | 'notifications' | 'security' | 'display'>('profile');
   const { userProfile } = useAppStore();
   const displayName = userProfile?.full_name || userProfile?.email || 'Teacher';

   const TabButton = ({ id, icon: Icon, label }: { id: typeof activeTab, icon: any, label: string }) => (
      <button
         onClick={() => setActiveTab(id)}
         className={`w-full text-left px-4 py-3 rounded-lg font-medium flex items-center gap-3 transition-colors ${activeTab === id
            ? 'bg-white border border-slate-200 shadow-sm text-indigo-600 font-bold'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
      >
         <Icon size={18} /> {label}
      </button>
   );

   return (
      <div className="flex-1 p-8 overflow-auto bg-slate-50">
         <h1 className="text-2xl font-bold text-slate-800 mb-8">Settings</h1>

         <div className="flex flex-col lg:flex-row gap-8 items-start max-w-6xl">
            {/* Sidebar Nav */}
            <div className="w-full lg:w-64 flex-shrink-0 space-y-1">
               <TabButton id="profile" icon={User} label="Profile" />
               <TabButton id="school" icon={Globe} label="School Settings" />
               <TabButton id="notifications" icon={Bell} label="Notifications" />
               <TabButton id="security" icon={Shield} label="Security" />
               <TabButton id="display" icon={Monitor} label="Display" />
            </div>

            {/* Content */}
            <div className="flex-1 w-full space-y-6">
               <AnimatePresence mode="wait">
                  {activeTab === 'profile' && (
                     <motion.div
                        key="profile"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-6"
                     >
                        {/* Profile Card */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                           <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Personal Information</h2>

                           <div className="flex items-start gap-6 mb-8">
                              <div className="relative">
                                 <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-md overflow-hidden">
                                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Teacher" alt="Profile" />
                                 </div>
                                 <button className="absolute bottom-0 right-0 bg-indigo-600 text-white p-1.5 rounded-full border-2 border-white hover:bg-indigo-700">
                                    <User size={14} />
                                 </button>
                              </div>
                              <div className="flex-1 grid grid-cols-2 gap-4">
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">First Name</label>
                                    <input type="text" defaultValue={displayName.split(' ')[0] || 'Teacher'} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                 </div>
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Last Name</label>
                                    <input type="text" defaultValue={displayName.split(' ').slice(1).join(' ') || ''} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                 </div>
                                 <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                                    <input type="email" defaultValue={userProfile?.email || ''} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                 </div>
                              </div>
                           </div>

                           <div className="flex justify-end">
                              <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-sm">Save Changes</button>
                           </div>
                        </div>

                        {/* School Info */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                           <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">School & Class</h2>
                           <div className="grid grid-cols-2 gap-6">
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">School Name</label>
                                 <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                                    <Globe size={16} /> Lincoln Elementary
                                 </div>
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Primary Class</label>
                                 <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                                    <option>Class 3B (Current)</option>
                                    <option>Class 4A</option>
                                 </select>
                              </div>
                           </div>
                        </div>
                     </motion.div>
                  )}

                  {activeTab === 'school' && (
                     <motion.div
                        key="school"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-6"
                     >
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                           <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">School Details</h2>
                           <div className="space-y-4">
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">School Name</label>
                                 <input type="text" defaultValue="Springfield Elementary" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Join Domain / Email Restrictions</label>
                                 <input type="text" defaultValue="@springfield.edu" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                 <p className="text-xs text-slate-400 mt-1">Only teachers with this email domain can automatically join your school.</p>
                              </div>
                           </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                           <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Seat Licensing & Billing</h2>
                           <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                              <div>
                                 <div className="font-bold text-indigo-900">Pro School Plan</div>
                                 <div className="text-sm text-indigo-700">12 of 20 Teacher Seats Used</div>
                              </div>
                              <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">Manage Plan</button>
                           </div>
                        </div>
                     </motion.div>
                  )}

                  {activeTab === 'notifications' && (
                     <motion.div
                        key="notifications"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
                     >
                        <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Notification Preferences</h2>
                        <div className="space-y-4">
                           {['Student Submissions', 'Parent Messages', 'Weekly Reports', 'System Updates'].map((item) => (
                              <div key={item} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50">
                                 <span className="font-medium text-slate-700">{item}</span>
                                 <button className="text-indigo-600"><ToggleRight size={32} /></button>
                              </div>
                           ))}
                        </div>
                     </motion.div>
                  )}

                  {activeTab === 'security' && (
                     <motion.div
                        key="security"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
                     >
                        <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Security</h2>
                        <button className="flex items-center gap-2 text-indigo-600 font-bold border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-50">
                           <Lock size={16} /> Change Password
                        </button>
                     </motion.div>
                  )}

                  {activeTab === 'display' && (
                     <motion.div
                        key="display"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm"
                     >
                        <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Appearance</h2>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50">
                           <div className="flex items-center gap-3">
                              <Moon size={20} className="text-slate-500" />
                              <span className="font-medium text-slate-700">Dark Mode</span>
                           </div>
                           <button className="text-slate-300"><ToggleLeft size={32} /></button>
                        </div>
                     </motion.div>
                  )}
               </AnimatePresence>
            </div>
         </div>
      </div >
   );
};

export default TeacherSettings;
