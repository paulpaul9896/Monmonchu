import React from 'react';
import { LogOut, LayoutDashboard, Users, Repeat, Globe, Settings } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'expenses' | 'split' | 'recurring' | 'currency' | 'settings';
  setActiveTab: (tab: 'expenses' | 'split' | 'recurring' | 'currency' | 'settings') => void;
}

// Apple Wallet 風格 Tab Bar — 所有分頁有圖示及標籤
const tabs = [
  { id: 'expenses', label: '帳本', icon: LayoutDashboard },
  { id: 'recurring', label: '定期', icon: Repeat },
  { id: 'split', label: '分帳', icon: Users },
  { id: 'currency', label: '匯率', icon: Globe },
  { id: 'settings', label: '設定', icon: Settings },
] as const;

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F2F2F7' }}>

      {/* ── Header：毛玻璃效果，Apple Wallet 風格 ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/75 backdrop-blur-2xl border-b border-black/[0.06]">
        <div className="max-w-2xl mx-auto px-5 h-[60px] flex items-center justify-between">
          <button
            onClick={() => setActiveTab('expenses')}
            className="flex items-center active:opacity-70 transition-opacity"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="MonMonChu"
              className="h-10 w-auto object-contain"
            />
          </button>

          <button
            onClick={() => signOut(auth)}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 active:opacity-60 transition-all"
            title="登出"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 pt-[76px] pb-[100px] px-4 max-w-2xl mx-auto w-full overflow-x-hidden">
        {children}
      </main>

      {/* ── Bottom Tab Bar：Apple Wallet 風格，懸浮膠囊型 ── */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 bg-[#1C1C1E]/95 backdrop-blur-xl rounded-[28px] px-2 py-2 shadow-2xl shadow-black/40">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  // 手機版緊湊，每個 tab 足夠寬度觸控
                  "flex flex-col items-center justify-center gap-[3px] rounded-[20px] transition-all duration-200 active:scale-95",
                  isActive
                    ? "bg-white px-4 py-2.5 min-w-[68px]"
                    : "px-3.5 py-2.5 min-w-[52px]"
                )}
              >
                <Icon
                  className={cn(
                    "transition-all",
                    isActive ? "w-[18px] h-[18px] text-slate-900 stroke-[2.5px]" : "w-[20px] h-[20px] text-slate-400 stroke-2"
                  )}
                />
                {isActive && (
                  <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest leading-none">
                    {tab.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
