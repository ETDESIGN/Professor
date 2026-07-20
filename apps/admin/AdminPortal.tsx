import React, { Suspense, lazy } from 'react';
import { useAppStore } from '../../store/useAppStore';

const DistrictAdminDashboard = lazy(() => import('./DistrictAdminDashboard'));
const ManagerDashboard = lazy(() => import('./ManagerDashboard'));

const PageLoader = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
    </div>
);

/**
 * Routes a user who reached /admin to the right surface:
 *  - manager  -> school-scoped ManagerDashboard
 *  - admin     -> district-wide DistrictAdminDashboard
 */
const AdminPortal: React.FC = () => {
    const { userProfile } = useAppStore();
    return (
        <Suspense fallback={<PageLoader />}>
            {userProfile?.role === 'manager' ? <ManagerDashboard /> : <DistrictAdminDashboard />}
        </Suspense>
    );
};

export default AdminPortal;
