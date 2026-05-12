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
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const handleForgotPassword = async () => {
    if (!email) {
      setError('請先輸入電郵地址以重設密碼');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('重設密碼郵件已發送，請查收');
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

        <form onSubmit={handleAuth} className="w-full space-y-4">
          <div className="relative">
            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input
              type="email"
              placeholder="電郵地址"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:border-sky-500 focus:ring-8 focus:ring-sky-500/5 transition-all font-bold text-slate-700"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
            <input
              type="password"
              placeholder="密碼"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:border-sky-500 focus:ring-8 focus:ring-sky-500/5 transition-all font-bold text-slate-700"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-sky-500 transition-colors"
            >
              忘記密碼？
            </button>
          </div>

          {error && (
            <p className="text-rose-500 text-[10px] font-black text-center px-4 bg-rose-50 py-2 rounded-xl">{error}</p>
          )}
          {message && (
            <p className="text-emerald-500 text-[10px] font-black text-center px-4 bg-emerald-50 py-2 rounded-xl">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-xs hover:bg-slate-800 active:scale-95 transition-all shadow-xl disabled:opacity-50"
          >
            {loading ? '處理中...' : isLogin ? '立即進入' : '建立帳號'}
          </button>
        </form>

        <div className="w-full flex items-center gap-4 my-8">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">或使用</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        <button
          onClick={handleGoogleLogin}
          type="button"
          disabled={loading}
          className="w-full py-5 bg-white border-2 border-slate-100 text-slate-900 rounded-3xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-slate-50 active:scale-95 transition-all"
        >
          <img src="https://www.google.com/favicon.ico" className="w-4 h-4 grayscale opacity-70" alt="" />
          Google 帳號登入
        </button>

        <div className="mt-10 flex items-center gap-2">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            {isLogin ? '新朋友？' : '老朋友？'}
          </p>
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-sky-500 font-black hover:underline uppercase tracking-widest"
          >
            {isLogin ? '立即註冊' : '返回登入'}
          </button>
        </div>
      </div>
    </div>
  );
};
