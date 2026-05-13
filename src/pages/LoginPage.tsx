import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Mail, Lock, LogIn, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';

export const LoginPage: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-[40px] p-10 shadow-2xl border border-slate-100 flex flex-col items-center">
        <div className="w-24 h-24 flex items-center justify-center mb-8 relative group">
          <span className="text-7xl animate-bounce duration-[3000ms]">💸</span>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-white text-[10px] font-black italic shadow-lg">M</div>
        </div>
        <h1 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">MonMonChu</h1>
        <p className="text-sm text-slate-400 font-bold mb-10 tracking-widest uppercase">你的靈魂理財助手</p>

        {error && (
          <p className="w-full text-rose-500 text-[10px] font-black text-center px-4 bg-rose-50 py-2 rounded-xl mb-6">{error}</p>
        )}

        <button
          onClick={handleGoogleLogin}
          type="button"
          disabled={loading}
          className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-xs hover:bg-slate-800 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5 bg-white rounded-full p-0.5" alt="" />
          {loading ? '處理中...' : '使用 Google 帳號登入'}
        </button>

        <p className="mt-12 text-[10px] text-slate-300 font-black uppercase tracking-[0.3em] text-center italic">
          安全 • 快速 • 只有 Gmail
        </p>
      </div>
    </div>
  );
};
