import React from 'react';
import { LogOut, PieChart, Users, Repeat, Globe, Settings } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'expenses' | 'split' | 'recurring' | 'currency' | 'settings';
  setActiveTab: (tab: 'expenses' | 'split' | 'recurring' | 'currency' | 'settings') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'expenses', label: '帳本', icon: PieChart },
    { id: 'recurring', label: '定期', icon: Repeat },
    { id: 'split', label: '分帳', icon: Users },
    { id: 'currency', label: '匯率', icon: Globe },
    { id: 'settings', label: '設定', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-xl border-b border-slate-100 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 flex items-center justify-center relative group cursor-pointer" onClick={() => setActiveTab('expenses')}>
            <span className="text-3xl">💸</span>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-slate-900 rounded-full flex items-center justify-center text-white text-[6px] font-black italic shadow-sm">M</div>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">MonMonChu</h1>
        </div>

        <button
          onClick={() => signOut(auth)}
          className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
          title="登出"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-24 pb-32 px-6 max-w-2xl mx-auto w-full">
        {children}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 h-20 bg-slate-900 rounded-[32px] shadow-2xl px-4 flex items-center gap-2 z-50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-[72px] h-12 rounded-2xl transition-all duration-300",
                isActive ? "bg-white text-slate-900 shadow-xl" : "text-slate-400 hover:text-white"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
              <span className={cn("text-[9px] font-black uppercase tracking-widest", isActive ? "block" : "hidden")}>
                {tab.id}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
