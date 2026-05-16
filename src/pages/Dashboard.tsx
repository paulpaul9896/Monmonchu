import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot, addDoc,
  serverTimestamp, deleteDoc, doc, updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  Trash2, ArrowUpCircle, ArrowDownCircle, Globe,
  Pencil, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  format, isSameDay, startOfMonth, endOfMonth,
  eachDayOfInterval, startOfWeek, endOfWeek,
  addMonths, subMonths
} from 'date-fns';
import { zhHK } from 'date-fns/locale';

interface Transaction {
  id: string;
  amount: number;
  category: string;
  type: 'expense' | 'income';
  dateStr: string;
  remark: string;
  userId: string;
  foreignAmount?: number;
  foreignCurrency?: string;
}

const COLORS = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FF2D55'];

// 大數字縮寫（避免 overflow）
const fmtAmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `$${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
};

// YYYY-MM-DD 字串轉本地 Date（避免 UTC 偏移問題）
const parseLocalDate = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const DEFAULT_CATEGORIES = ['餐飲', '交通', '購物', '娛樂', '醫療', '日常', '其他'];

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [remark, setRemark] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringItems, setRecurringItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 月薪自動注入（每次進入帳本頁，確保本月 1 號有一筆月薪收入）
  const salaryCheckedRef = useRef(false);
  useEffect(() => {
    if (loading || !user || salaryCheckedRef.current) return;
    salaryCheckedRef.current = true;

    const salaryAmt = parseFloat(localStorage.getItem('monmon_m_salary') || '0');
    if (salaryAmt <= 0) return;

    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const firstOfMonth = `${today.getFullYear()}-${mm}-01`;

    const hasSalary = transactions.some(
      t => t.dateStr === firstOfMonth && t.type === 'income' && t.category === '月薪'
    );
    if (!hasSalary) {
      addDoc(collection(db, 'expenses'), {
        amount: salaryAmt,
        category: '月薪',
        type: 'income' as const,
        remark: '月薪自動記錄',
        dateStr: firstOfMonth,
        userId: user.uid,
        isSalaryAuto: true,
        createdAt: serverTimestamp(),
      }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.uid, transactions.length]);

  // 預算 state
  const [monthlyBudget, setMonthlyBudget] = useState<number>(() =>
    parseFloat(localStorage.getItem('monmon_budget') || '0')
  );
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState('');

  // 日曆 state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // 外幣換算
  const [showCurrency, setShowCurrency] = useState(false);
  const [foreignAmount, setForeignAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('JPY');
  const [rates, setRates] = useState<Record<string, number>>({});
  const currs = ['JPY', 'TWD', 'USD', 'EUR', 'CNY', 'KRW'];

  // 類別
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('monmon_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });
  const [isEditingCategories, setIsEditingCategories] = useState(false);

  // 最近紀錄篩選器
  const [listFilter, setListFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/HKD')
      .then(r => r.json())
      .then(d => setRates(d.rates))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'expenses'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Transaction[];
      data.sort((a, b) => {
        const ta = (a as any).createdAt?.toMillis?.() ?? 0;
        const tb = (b as any).createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      setTransactions(data);
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'expenses', user));

    const qRec = query(collection(db, 'recurring'), where('userId', '==', user.uid));
    const unsubRec = onSnapshot(qRec, snap =>
      setRecurringItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    , err => handleFirestoreError(err, OperationType.LIST, 'recurring', user));

    return () => { unsub(); unsubRec(); };
  }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount) return;
    const data = {
      amount: parseFloat(amount),
      category: category || '其他',
      type,
      remark,
      dateStr: format(selectedDate, 'yyyy-MM-dd'),
      userId: user.uid,
      foreignAmount: foreignAmount ? parseFloat(foreignAmount) : null,
      foreignCurrency: foreignAmount ? selectedCurrency : null,
    };
    try {
      if (editingId) {
        await updateDoc(doc(db, 'expenses', editingId), { ...data, updatedAt: serverTimestamp() });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'expenses'), { ...data, createdAt: serverTimestamp() });
      }
      const cat = category || '其他';
      if (!categories.includes(cat)) {
        const nc = [...categories, cat];
        setCategories(nc);
        localStorage.setItem('monmon_categories', JSON.stringify(nc));
      }
      setAmount(''); setRemark(''); setCategory('');
      setForeignAmount(''); setShowCurrency(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'expenses', user);
    }
  };

  const handleEdit = (t: Transaction) => {
    window.scrollTo({ top: 500, behavior: 'smooth' });
    setEditingId(t.id);
    setAmount(t.amount.toString());
    setCategory(t.category);
    setType(t.type);
    setRemark(t.remark);
    // 用本地日期解析，避免 UTC offset 偏移一天
    setSelectedDate(parseLocalDate(t.dateStr));
    if (t.foreignAmount) {
      setForeignAmount(t.foreignAmount.toString());
      setSelectedCurrency(t.foreignCurrency || 'JPY');
      setShowCurrency(true);
    } else {
      setForeignAmount(''); setShowCurrency(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try { await deleteDoc(doc(db, 'expenses', id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, 'expenses', user); }
  };

  const applyCurrency = () => {
    if (!foreignAmount || !rates[selectedCurrency]) return;
    setAmount((parseFloat(foreignAmount) / rates[selectedCurrency]).toFixed(2));
  };

  // 日曆資料
  const monthStart  = startOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end:   endOfWeek(endOfMonth(monthStart)),
  });

  // 返回當天收入、支出與淨額
  const getDayAmounts = (day: Date) => {
    const ds = format(day, 'yyyy-MM-dd');
    const dayTxns = transactions.filter(t => t.dateStr === ds);
    const income  = dayTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = dayTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  };

  // 日曆格內金額縮寫
  const fmtCalAmt = (n: number) =>
    n >= 10000 ? `${(n / 1000).toFixed(0)}k`
    : n >= 1000 ? `${(n / 1000).toFixed(1)}k`
    : `${Math.round(n)}`;

  // 統計計算
  const stats = transactions.reduce((acc, t) => {
    if (t.type === 'expense') {
      const d = parseLocalDate(t.dateStr);
      if (isSameDay(d, selectedDate))
        acc.daily += t.amount;
      if (d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear())
        acc.monthly += t.amount;
      if (d.getFullYear() === currentMonth.getFullYear())
        acc.yearly += t.amount;
    }
    return acc;
  }, { daily: 0, monthly: 0, yearly: 0 });

  const totalBalance =
    transactions.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0) +
    recurringItems.reduce((a, r) => {
      const v = r.freq === 'monthly' ? r.amount : r.amount / 12;
      return a + (r.type === 'income' ? v : -v);
    }, 0);

  const chartData = Object.entries(
    transactions.filter(t => t.type === 'expense')
      .reduce((a, t) => { a[t.category] = (a[t.category] || 0) + t.amount; return a; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  // 保存預算
  const saveBudget = () => {
    const b = parseFloat(tempBudget) || 0;
    setMonthlyBudget(b);
    localStorage.setItem('monmon_budget', b.toString());
    setIsEditingBudget(false);
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ══ 淨資產卡片（Apple Wallet 深色卡片風格）══ */}
      <div className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #1C1C2E 0%, #16213E 60%, #0F3460 100%)' }}>
        {/* 裝飾光暈 */}
        <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #007AFF, transparent)' }} />
        <div className="pointer-events-none absolute -bottom-12 -left-12 w-40 h-40 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #AF52DE, transparent)' }} />

        <div className="relative z-10">
          {/* 頂部：標題 + 設定預算按鈕 */}
          <div className="flex items-start justify-between mb-4">
            <p className="text-[11px] font-semibold tracking-[0.15em] text-white/50 uppercase">淨資產變動 (HKD)</p>
            {isEditingBudget ? (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-2xl p-1 border border-white/10">
                <input
                  type="number"
                  value={tempBudget}
                  onChange={e => setTempBudget(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveBudget()}
                  autoFocus
                  className="w-24 bg-transparent text-white text-sm font-bold text-center outline-none px-2"
                  placeholder="預算金額"
                />
                <button onClick={saveBudget} className="px-2.5 py-1 bg-sky-500 rounded-xl text-[10px] font-black">✓</button>
                <button onClick={() => setIsEditingBudget(false)} className="px-2 py-1 bg-white/10 rounded-xl text-[10px] text-white/60">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setTempBudget(monthlyBudget.toString()); setIsEditingBudget(true); }}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-2xl text-[10px] font-semibold tracking-widest text-white/70 border border-white/10 transition-all whitespace-nowrap"
              >
                {monthlyBudget > 0 ? `預算 $${monthlyBudget.toLocaleString()}` : '設定預算'}
              </button>
            )}
          </div>

          {/* 大金額顯示：用 clamp 控制字型，完全不換行 */}
          <div className="mb-5 overflow-hidden">
            <p
              className="font-black tabular-nums text-white leading-none"
              style={{ fontSize: 'clamp(1.8rem, 8vw, 2.8rem)', letterSpacing: '-0.02em' }}
            >
              {totalBalance >= 0 ? '+' : ''}
              ${Math.abs(totalBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            {totalBalance < 0 && (
              <span className="text-[11px] font-semibold text-rose-400 mt-1 block">淨負債</span>
            )}
          </div>

          {/* 預算進度條 */}
          <div className="mb-5 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">本月預算</span>
              <span className={cn(
                "text-[10px] font-bold",
                monthlyBudget > 0 && stats.monthly > monthlyBudget ? "text-rose-400" : "text-white/60"
              )}>
                {monthlyBudget > 0 ? `${Math.round((stats.monthly / monthlyBudget) * 100)}%` : '未設定'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-1000",
                  stats.monthly > (monthlyBudget || Infinity) ? "bg-rose-500" : "bg-sky-400")}
                style={{ width: `${Math.min((stats.monthly / (monthlyBudget || 1)) * 100, 100)}%` }}
              />
            </div>
            {monthlyBudget > 0 && (
              <p className="text-[9px] text-white/30 text-right">
                剩餘 {fmtAmt(Math.max(monthlyBudget - stats.monthly, 0))}
              </p>
            )}
          </div>

          {/* 今日 / 本月 / 今年 三格統計 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '今日支出', val: stats.daily },
              { label: '本月支出', val: stats.monthly },
              { label: '今年支出', val: stats.yearly },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/8 rounded-[16px] p-3 text-center" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-[8px] font-semibold text-white/40 uppercase tracking-widest mb-1.5 leading-tight">{label}</p>
                {/* fmtAmt 防止大數字 overflow */}
                <p className="font-black text-white tabular-nums text-sm leading-none">{fmtAmt(val)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 日曆卡片 ══ */}
      <div className="bg-white rounded-[24px] p-5 shadow-sm border border-black/[0.05]">
        {/* 月份導航 */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 active:scale-90 transition-all">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <h3 className="text-sm font-bold text-slate-900">
            {format(currentMonth, 'yyyy年 M月', { locale: zhHK })}
          </h3>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 active:scale-90 transition-all">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1.5">{d}</div>
          ))}
          {calendarDays.map((day, i) => {
            const isSelected  = isSameDay(day, selectedDate);
            const isToday     = isSameDay(day, new Date());
            const isThisMonth = day.getMonth() === currentMonth.getMonth();
            const { income, expense, net } = getDayAmounts(day);
            const hasIncome  = income > 0;
            const hasExpense = expense > 0;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "flex flex-col items-center py-1.5 rounded-[10px] transition-all gap-[3px] min-h-[44px]",
                  isSelected  ? "bg-[#007AFF] shadow-md shadow-blue-200"
                              : isToday ? "bg-blue-50"
                              : "hover:bg-slate-50",
                  !isThisMonth && !isSelected && "opacity-25"
                )}
              >
                {/* 日期數字 */}
                <span className={cn(
                  "text-[12px] font-bold leading-none",
                  isSelected ? "text-white" : isToday ? "text-[#007AFF]" : "text-slate-800"
                )}>
                  {format(day, 'd')}
                </span>

                {/* 金額 badges：收入綠 / 支出紅，選中時用半透明白色 */}
                <div className="flex flex-col items-center gap-[2px] w-full px-0.5">
                  {hasIncome && (
                    <span className={cn(
                      "text-[6.5px] font-black leading-none rounded-full px-1 py-[1.5px] w-full text-center",
                      isSelected ? "bg-white/25 text-white" : "bg-emerald-50 text-emerald-600"
                    )}>
                      +{fmtCalAmt(income)}
                    </span>
                  )}
                  {hasExpense && (
                    <span className={cn(
                      "text-[6.5px] font-black leading-none rounded-full px-1 py-[1.5px] w-full text-center",
                      isSelected ? "bg-white/20 text-white/90" : "bg-rose-50 text-rose-500"
                    )}>
                      -{fmtCalAmt(expense)}
                    </span>
                  )}
                </div>

                {/* 淨額點（只在有混合收支時顯示，作為底部指示點）*/}
                {hasIncome && hasExpense && (
                  <div className={cn(
                    "w-1 h-1 rounded-full flex-shrink-0",
                    isSelected ? "bg-white/50" : net >= 0 ? "bg-emerald-400" : "bg-rose-400"
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ 新增 / 修改紀錄表單 ══ */}
      <div className="bg-white rounded-[24px] p-5 shadow-sm border border-black/[0.05] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-slate-900">
            {editingId ? '修改紀錄' : '新增紀錄'}
          </h3>
          {editingId && (
            <button onClick={() => setEditingId(null)} className="text-[12px] font-semibold text-slate-400 hover:text-slate-600">取消</button>
          )}
        </div>

        {/* 支出 / 收入 切換 */}
        <div className="flex bg-[#F2F2F7] p-1 rounded-[14px] gap-1">
          {(['expense', 'income'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "flex-1 py-2.5 rounded-[11px] text-[13px] font-semibold transition-all",
                type === t
                  ? t === 'expense' ? 'bg-white text-rose-500 shadow-sm' : 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-400'
              )}
            >
              {t === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>

        {/* 日期選擇器（新增！） */}
        <div className="space-y-1.5 min-w-0 overflow-hidden">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">日期</label>
          <input
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={e => {
              if (!e.target.value) return;
              setSelectedDate(parseLocalDate(e.target.value));
            }}
            className="w-full min-w-0 max-w-full px-4 py-3 bg-[#F2F2F7] border border-transparent rounded-[14px] outline-none focus:border-[#007AFF] transition-all font-semibold text-sm text-slate-900"
          />
        </div>

        {/* 金額 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">金額 (HKD)</label>
            <button
              onClick={() => setShowCurrency(!showCurrency)}
              className={cn(
                "flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all",
                showCurrency ? "bg-sky-500 text-white" : "bg-sky-50 text-sky-600"
              )}
            >
              <Globe className="w-3 h-3" /> 外幣換算
            </button>
          </div>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-5 py-4 bg-[#F2F2F7] border border-transparent rounded-[14px] outline-none focus:border-[#007AFF] transition-all font-black text-2xl text-center tabular-nums text-slate-900"
          />
        </div>

        {/* 外幣換算面板 */}
        {showCurrency && (
          <div className="p-4 bg-sky-50 rounded-[18px] border border-sky-100 flex gap-2 items-center">
            <select
              value={selectedCurrency}
              onChange={e => setSelectedCurrency(e.target.value)}
              className="bg-white px-3 py-2 rounded-xl text-sm font-bold border border-sky-100 outline-none"
            >
              {currs.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              placeholder="外幣金額"
              value={foreignAmount}
              onChange={e => setForeignAmount(e.target.value)}
              className="flex-1 px-4 py-2 bg-white rounded-xl border border-sky-100 outline-none text-sm font-semibold text-center"
            />
            <button
              onClick={applyCurrency}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-xl text-[11px] font-bold active:scale-95 transition-all"
            >
              換算
            </button>
          </div>
        )}

        {/* 類別 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">類別</label>
            <button
              onClick={() => setIsEditingCategories(!isEditingCategories)}
              className="text-[10px] font-semibold text-sky-500"
            >
              {isEditingCategories ? '完成' : '編輯'}
            </button>
          </div>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="輸入或選擇類別"
            className="w-full px-4 py-3 bg-[#F2F2F7] border border-transparent rounded-[14px] outline-none focus:border-[#007AFF] transition-all font-semibold text-sm text-slate-900"
          />
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {categories.map(cat => (
              <div key={cat} className="relative">
                <button
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all",
                    category === cat ? "bg-[#1C1C1E] text-white" : "bg-[#F2F2F7] text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {cat}
                </button>
                {isEditingCategories && (
                  <button
                    onClick={() => {
                      const nc = categories.filter(c => c !== cat);
                      setCategories(nc);
                      localStorage.setItem('monmon_categories', JSON.stringify(nc));
                      if (category === cat) setCategory('');
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-sm z-10"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
            {isEditingCategories && (
              <button
                onClick={() => { setCategories(DEFAULT_CATEGORIES); localStorage.setItem('monmon_categories', JSON.stringify(DEFAULT_CATEGORIES)); }}
                className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold text-slate-400 underline"
              >
                重置
              </button>
            )}
          </div>
        </div>

        {/* 備註 */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">備註</label>
          <input
            type="text"
            placeholder="項目名稱或備註（選填）"
            value={remark}
            onChange={e => setRemark(e.target.value)}
            className="w-full px-4 py-3 bg-[#F2F2F7] border border-transparent rounded-[14px] outline-none focus:border-[#007AFF] transition-all font-semibold text-sm text-slate-900"
          />
        </div>

        {/* 提交按鈕 */}
        <button
          onClick={handleAdd}
          className="w-full py-4 bg-[#007AFF] text-white rounded-[16px] font-bold text-[15px] active:scale-[0.98] transition-all shadow-lg shadow-blue-200 mt-1"
        >
          {editingId ? '保存更改' : '保存明細'}
        </button>
      </div>

      {/* ══ 最近紀錄 ══ */}
      <div className="space-y-2 pb-24">
        {/* 標題 + 篩選器 */}
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="text-[13px] font-semibold text-slate-400">最近紀錄</h3>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {([ 
            { id: 'all',   label: '全部' },
            { id: 'today', label: '今天' },
            { id: 'week',  label: '本週' },
            { id: 'month', label: '本月' },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setListFilter(id)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all flex-shrink-0",
                listFilter === id
                  ? "bg-[#1C1C1E] text-white"
                  : "bg-white text-slate-500 border border-black/[0.06] shadow-sm"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {(() => {
          const now = new Date();
          const filtered = listFilter === 'all' ? transactions : transactions.filter(t => {
            const d = parseLocalDate(t.dateStr);
            if (listFilter === 'today') return isSameDay(d, now);
            if (listFilter === 'week')  return d >= startOfWeek(now) && d <= endOfWeek(now);
            if (listFilter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            return true;
          });
          if (filtered.length === 0) return (
            <div className="py-10 text-center text-slate-300 italic text-sm">此時段沒有記錄</div>
          );
          return filtered.map(t => (
          <div
            key={t.id}
            className="group bg-white rounded-[20px] border border-black/[0.05] shadow-sm px-4 py-3.5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0",
                t.type === 'income' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
              )}>
                {t.type === 'income' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[15px] text-slate-900 truncate">
                  {t.remark || t.category}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-slate-400 font-medium">{t.category}</span>
                  <span className="text-slate-200">·</span>
                  <span className="text-[11px] text-slate-300">{t.dateStr}</span>
                  {t.foreignAmount && (
                    <span className="text-[9px] text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">
                      {t.foreignCurrency} {t.foreignAmount.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 金額 + 操作按鈕（手機版永遠可見） */}
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              <p className={cn("font-bold text-[15px] tabular-nums",
                t.type === 'income' ? 'text-emerald-500' : 'text-slate-900'
              )}>
                {t.type === 'income' ? '+' : ''}${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {/* 桌面版 hover 顯示，手機版一直可見 */}
              <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                <button
                  onClick={() => handleEdit(t)}
                  className="p-1.5 bg-slate-50 hover:bg-sky-50 text-slate-400 hover:text-sky-500 active:text-sky-500 rounded-lg transition-all"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { if (confirm('確定刪除此紀錄？')) handleDelete(t.id); }}
                  className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-500 active:text-rose-500 rounded-lg transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          ));
        })()}
      </div>

      {/* ══ 支出分佈圖 ══ */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm mb-8">
          <h3 className="text-[13px] font-semibold text-slate-400 mb-4 text-center">支出分佈</h3>
          <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 px-2">
            {chartData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[12px] font-medium text-slate-500 truncate">{item.name}</span>
                </div>
                <span className="text-[12px] font-bold text-slate-900 tabular-nums">{fmtAmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
