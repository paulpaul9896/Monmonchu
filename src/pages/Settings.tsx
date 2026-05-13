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

  const appVersion = '1.1.10';

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
         <h2 className="text-4xl font-black tracking-tighter mb-2">MonMonChu 系統設定</h2>
         <p className="text-xs font-bold text-slate-400 opacity-80 uppercase tracking-widest">管理您的帳號與偏好</p>
      </div>

      <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-8">
        {/* Account Info */}
        <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-sky-100">
               <span className="text-xl">👤</span>
             </div>
             <div>
               <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">當前帳號</p>
               <p className="text-sm font-bold text-slate-900">{user?.email}</p>
             </div>
           </div>
           <button onClick={() => signOut(auth)} className="p-3 bg-white text-rose-500 rounded-xl shadow-sm hover:bg-rose-50 transition-colors">
              <LogOut className="w-5 h-5" />
           </button>
        </div>

        {/* Change Password */}
        <section className="space-y-4">
           <div className="flex items-center gap-2 mb-2">
             <Shield className="w-4 h-4 text-sky-500" />
             <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 italic">安全性設定</h3>
           </div>
           <form onSubmit={handleUpdatePassword} className="space-y-3">
              <input
                type="password"
                placeholder="新密碼 (至少6位數)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-sky-500 transition-all font-bold text-sm text-center"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-slate-800 disabled:opacity-50 transition-all"
              >
                {loading ? '處理中...' : '更新密碼'}
              </button>
              {message && <p className="text-emerald-500 text-[10px] font-black text-center bg-emerald-50 py-2 rounded-xl">{message}</p>}
              {error && <p className="text-rose-500 text-[10px] font-black text-center bg-rose-50 py-2 rounded-xl">{error}</p>}
           </form>
        </section>

        {/* System Info */}
        <section className="space-y-4 pt-4 border-t border-slate-100">
           <div className="flex items-center gap-2 mb-2">
             <Info className="w-4 h-4 text-slate-300" />
             <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 italic">系統資訊</h3>
           </div>
           <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-center">
                 <Clock className="w-5 h-5 text-slate-300 mb-2" />
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">最後上傳時間</p>
                 <p className="text-[10px] font-bold text-slate-900">{lastSync}</p>
              </div>
              <div className="p-5 bg-slate-50 rounded-2xl flex flex-col items-center justify-center text-center">
                 <SettingsIcon className="w-5 h-5 text-slate-300 mb-2" />
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">應用程式版本</p>
                 <p className="text-[10px] font-bold text-slate-900">v{appVersion}</p>
              </div>
           </div>
        </section>
      </div>
    </div>
  );
};
