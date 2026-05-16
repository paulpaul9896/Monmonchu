import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Settings as SettingsIcon, Clock, Info, LogOut, Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AVATAR_KEY = 'monmon_avatar';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [lastSync, setLastSync] = useState<string>('未同步');
  const [avatar, setAvatar] = useState<string>(() => localStorage.getItem(AVATAR_KEY) || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const appVersion = '1.1.13';

  useEffect(() => {
    const fetchLastSync = async () => {
      if (!user) return;
      try {
        const q = query(
          collection(db, 'expenses'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docs = snapshot.docs.map(d => d.data());
          docs.sort((a, b) => {
            const dateA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
            const dateB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
            return dateB - dateA;
          });
          const latest = docs[0];
          if (latest.createdAt) {
            setLastSync(latest.createdAt.toDate().toLocaleString('zh-HK'));
          }
        }
      } catch (err) {
        console.error('Error fetching last sync:', err);
      }
    };
    fetchLastSync();
  }, [user]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setAvatar(base64);
      localStorage.setItem(AVATAR_KEY, base64);
    };
    reader.readAsDataURL(file);
  };

  // 頭像優先順序：用戶上傳 > Google 頭像 > 預設
  const avatarSrc = avatar || user?.photoURL || '';

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #1C1C2E 0%, #2c2c3e 60%, #3b3b5c 100%)' }}>
        <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #007AFF, transparent)' }} />
        <div className="relative z-10">
          <h2 className="text-[24px] font-bold tracking-tight mb-1">系統設定</h2>
          <p className="text-[12px] font-medium text-white/50">管理您的帳號與偏好</p>
        </div>
      </div>

      {/* 帳號資訊 */}
      <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">

            {/* 可點擊頭像 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-12 h-12 rounded-[14px] overflow-hidden bg-[#F2F2F7] flex items-center justify-center flex-shrink-0 active:scale-90 transition-all"
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt="頭像" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">👤</span>
              )}
              {/* 相機覆蓋層 */}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity">
                <Camera className="w-4 h-4 text-white" />
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">當前帳號</p>
              <p className="text-[14px] font-semibold text-slate-900">{user?.email}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">點擊頭像更換相片</p>
            </div>
          </div>

          <button
            onClick={() => signOut(auth)}
            className="p-2.5 bg-rose-50 text-rose-500 rounded-[10px] active:scale-90 transition-all"
            title="登出"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 系統資訊 */}
      <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm space-y-4 pb-28">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400" />
          <h3 className="text-[13px] font-semibold text-slate-700">系統資訊</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-[#F2F2F7] rounded-[16px] text-center">
            <Clock className="w-4 h-4 text-slate-400 mx-auto mb-2" />
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">最後上傳</p>
            <p className="text-[11px] font-bold text-slate-800">{lastSync}</p>
          </div>
          <div className="p-4 bg-[#F2F2F7] rounded-[16px] text-center">
            <SettingsIcon className="w-4 h-4 text-slate-400 mx-auto mb-2" />
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">版本</p>
            <p className="text-[11px] font-bold text-slate-800">v{appVersion}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
