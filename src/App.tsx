import React, { useState } from 'react';
import { useAuth, AuthProvider } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { SplitBill } from './pages/SplitBill';
import { Recurring } from './pages/Recurring';
import { Currency } from './pages/Currency';
import { Settings } from './pages/Settings';
import { Layout } from './components/Layout';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'expenses' | 'split' | 'recurring' | 'currency' | 'settings'>('expenses');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin text-4xl">⏳</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'expenses' && <Dashboard />}
      {activeTab === 'split' && <SplitBill />}
      {activeTab === 'recurring' && <Recurring />}
      {activeTab === 'currency' && <Currency />}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
