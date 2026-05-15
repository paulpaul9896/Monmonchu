import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { updatePassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Settings as SettingsIcon, Shield, Clock, Info, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string>('未同步');

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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPassword) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await updatePassword(user, newPassword);
      setMessage('密碼更新成功');
      setNewPassword('');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError('請重新登入後再修改密碼');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

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
            <div className="w-11 h-11 bg-[#007AFF] rounded-[12px] flex items-center justify-center text-white">
              <span className="text-lg">👤</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">當前帳號</p>
              <p className="text-[14px] font-semibold text-slate-900">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="p-2.5 bg-rose-50 text-rose-500 rounded-[10px] active:scale-90 transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 安全設定 */}
      <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#007AFF]" />
          <h3 className="text-[13px] font-semibold text-slate-700">安全性設定</h3>
        </div>
        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <input type="password" placeholder="新密碼 (至少 6 位數)" value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-sky-400 font-semibold text-sm transition-all" />
          <button type="submit" disabled={loading}
            className="w-full py-4 bg-[#1C1C1E] text-white rounded-[14px] font-bold text-[14px] disabled:opacity-50 active:scale-[0.98] transition-all">
            {loading ? '處理中...' : '更新密碼'}
          </button>
          {message && <p className="text-emerald-600 text-[12px] font-semibold text-center bg-emerald-50 py-2 rounded-[10px]">{message}</p>}
          {error   && <p className="text-rose-500   text-[12px] font-semibold text-center bg-rose-50   py-2 rounded-[10px]">{error}</p>}
        </form>
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
