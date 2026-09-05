import React from 'react';
import { AdminView } from '../src/components/views/AdminView';
import { AppProvider } from '../src/context/AppContext';
import { LanguageProvider } from '../src/context/LanguageContext';

export const AdminPage: React.FC = () => {
  return (
    <LanguageProvider>
      <AppProvider>
        <div className="min-h-screen bg-[#07090e] text-slate-100 p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            <AdminView />
          </div>
        </div>
      </AppProvider>
    </LanguageProvider>
  );
};

export default AdminPage;
