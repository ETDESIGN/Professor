import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './src/index.css';
import { SessionProvider } from './store/SessionContext';
import { Toaster } from 'sonner';
import DistrictAdminDashboard from './apps/admin/DistrictAdminDashboard';

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <SessionProvider>
            <Toaster position="top-center" richColors />
            <BrowserRouter basename="/admin">
                <Routes>
                    <Route path="/*" element={<DistrictAdminDashboard />} />
                </Routes>
            </BrowserRouter>
        </SessionProvider>
    );
}
