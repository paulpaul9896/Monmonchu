import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, orderBy, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Plus, Trash2, Calendar, Tag, CreditCard, ArrowUpCircle, ArrowDownCircle, Globe, Pencil, X } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
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

const COLORS = ['#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

import { startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';

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
  
  // Budget and Stats state
  const [monthlyBudget, setMonthlyBudget] = useState<number>(() => {
    return parseFloat(localStorage.getItem('monmon_budget') || '0');
  });
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState('');

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Currency conversion state
  const [showCurrency, setShowCurrency] = useState(false);
  const [foreignAmount, setForeignAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('JPY');
  const [rates, setRates] = useState<Record<string, number>>({});

  const currs = ['JPY', 'TWD', 'USD', 'EUR', 'CNY'];

  const DEFAULT_CATEGORIES = ['餐飲', '交通', '購物', '娛樂', '醫療', '日常', '其他'];
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('monmon_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/HKD')
      .then(res => res.json())
      .then(data => setRates(data.rates));
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'expenses'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      // Sort on client side to avoid missing index error
      data.sort((a, b) => {
        const dateA = (a as any).createdAt && typeof (a as any).createdAt.toMillis === 'function' ? (a as any).createdAt.toMillis() : 0;
        const dateB = (b as any).createdAt && typeof (b as any).createdAt.toMillis === 'function' ? (b as any).createdAt.toMillis() : 0;
        return dateB - dateA;
      });
      setTransactions(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses', user);
    });

    const qRec = query(
      collection(db, 'recurring'),
      where('userId', '==', user.uid)
    );

    const unsubscribeRec = onSnapshot(qRec, (snapshot) => {
      setRecurringItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'recurring', user);
    });

    return () => {
      unsubscribe();
      unsubscribeRec();
    };
  }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount) return;

    try {
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

      if (editingId) {
        await updateDoc(doc(db, 'expenses', editingId), {
          ...data,
          updatedAt: serverTimestamp(),
        });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...data,
          createdAt: serverTimestamp(),
        });
      }
      
      const savedCategory = category || '其他';
      if (!categories.includes(savedCategory)) {
        const newCats = [...categories, savedCategory];
        setCategories(newCats);
        localStorage.setItem('monmon_categories', JSON.stringify(newCats));
      }
      
      setAmount('');
      setRemark('');
      setCategory('');
      setForeignAmount('');
      setShowCurrency(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'expenses', user);
    }
  };

  const handleEdit = (t: Transaction) => {
    setEditingId(t.id);
    setAmount(t.amount.toString());
    setCategory(t.category);
    setType(t.type);
    setRemark(t.remark);
    setSelectedDate(new Date(t.dateStr));
    if (t.foreignAmount) {
      setForeignAmount(t.foreignAmount.toString());
      setSelectedCurrency(t.foreignCurrency || 'JPY');
      setShowCurrency(true);
    } else {
      setForeignAmount('');
      setShowCurrency(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'expenses', user);
    }
  };

  const chartData = Object.entries(
    transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  // Stats Calculation
  const stats = transactions.reduce((acc, t) => {
    if (t.type === 'expense') {
      const tDate = new Date(t.dateStr);
      // Daily (Selected)
      if (isSameDay(tDate, selectedDate)) acc.daily += t.amount;
      // Monthly (Current Calendar View)
      if (tDate.getMonth() === currentMonth.getMonth() && tDate.getFullYear() === currentMonth.getFullYear()) acc.monthly += t.amount;
      // Yearly (Current Calendar Year)
      if (tDate.getFullYear() === currentMonth.getFullYear()) acc.yearly += t.amount;
    }
    return acc;
  }, { daily: 0, monthly: 0, yearly: 0 });

  const totalBalance = transactions.reduce((acc, t) => {
    return acc + (t.type === 'income' ? t.amount : -t.amount);
  }, 0) + recurringItems.reduce((acc, r) => {
    const val = r.freq === 'monthly' ? r.amount : r.amount / 12;
    return acc + (r.type === 'income' ? val : -val);
  }, 0);

  const handleSetBudget = () => {
    const val = prompt('輸入每月消費預算 (HKD):', monthlyBudget.toString());
    if (val !== null) {
      const b = parseFloat(val);
      setMonthlyBudget(b);
      localStorage.setItem('monmon_budget', b.toString());
    }
  };

  const applyCurrency = () => {
    if (!foreignAmount || !rates[selectedCurrency]) return;
    const inHKD = parseFloat(foreignAmount) / rates[selectedCurrency];
    setAmount(inHKD.toFixed(2));
  };

  // Calendar logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDayTotal = (day: Date) => {
    const ds = format(day, 'yyyy-MM-dd');
    return transactions
      .filter(t => t.dateStr === ds)
      .reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Balance Card */}
      <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-sky-500/20 transition-all duration-700 pointer-events-none z-0" />
        <div className="relative z-20">
          {/* 手機版分兩行排列，避免「設定預算」按鈕令畫面變型 */}
          <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:justify-between sm:items-start">
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">淨資產變動 (HKD)</p>
              <h2 className="text-5xl font-black tracking-tighter tabular-nums break-all">
                ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </h2>
            </div>
            {isEditingBudget ? (
              /* 編輯預算時的輸入框 */
              <div className="flex items-center gap-2 bg-white/10 p-1 rounded-2xl border border-white/10 animate-in zoom-in-95 duration-200 self-start">
                <input
                  type="number"
                  value={tempBudget}
                  onChange={(e) => setTempBudget(e.target.value)}
                  className="w-28 bg-transparent text-white font-black text-center text-sm outline-none px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const b = parseFloat(tempBudget) || 0;
                      setMonthlyBudget(b);
                      localStorage.setItem('monmon_budget', b.toString());
                      setIsEditingBudget(false);
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    const b = parseFloat(tempBudget) || 0;
                    setMonthlyBudget(b);
                    localStorage.setItem('monmon_budget', b.toString());
                    setIsEditingBudget(false);
                  }}
                  className="p-2 bg-sky-500 rounded-xl text-[10px] font-black"
                >
                  ✓
                </button>
                <button
                  onClick={() => setIsEditingBudget(false)}
                  className="p-2 bg-white/10 rounded-xl text-[10px] font-black text-slate-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setTempBudget(monthlyBudget.toString());
                  setIsEditingBudget(true);
                }}
                className="self-start px-4 py-2 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 shadow-lg border border-white/5 relative z-30 whitespace-nowrap"
              >
                設定預算
              </button>
            )}
          </div>

          {/* Budget Bar */}
          <div className="space-y-2 mb-8">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>預算進度 (本月)</span>
              <span>{monthlyBudget > 0 ? `${Math.round((stats.monthly / monthlyBudget) * 100)}%` : '未設定'}</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-1000",
                  stats.monthly > monthlyBudget ? "bg-rose-500" : "bg-sky-400"
                )}
                style={{ width: `${Math.min((stats.monthly / (monthlyBudget || 1)) * 100, 100)}%` }}
              />
            </div>
            {monthlyBudget > 0 && (
              <p className="text-[9px] font-bold text-slate-500 text-right italic">
                剩餘: ${(monthlyBudget - stats.monthly).toLocaleString()}
              </p>
            )}
          </div>

          {/* Mini Stats Card */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 p-4 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">今日支出</p>
              <p className="text-sm font-black">${stats.daily.toLocaleString()}</p>
            </div>
            <div className="bg-white/5 p-4 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">本月支出</p>
              <p className="text-sm font-black">${stats.monthly.toLocaleString()}</p>
            </div>
            <div className="bg-white/5 p-4 rounded-3xl text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">今年支出</p>
              <p className="text-sm font-black">${stats.yearly.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>


      {/* Calendar Card */}
      <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between px-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">❮</button>
          <h3 className="font-black text-slate-900 uppercase tracking-widest text-[11px] font-mono">
            {format(currentMonth, 'MMMM yyyy', { locale: zhHK })}
          </h3>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">❯</button>
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => (
            <div key={d} className="text-center text-[10px] font-black text-slate-300 py-2">{d}</div>
          ))}
          {calendarDays.map((day, i) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const total = getDayTotal(day);
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "relative aspect-square flex flex-col items-center justify-between py-1.5 rounded-2xl transition-all border border-transparent",
                  isSelected ? "bg-sky-500 text-white shadow-lg shadow-sky-100 border-sky-400" : "hover:bg-slate-50",
                  !isCurrentMonth && !isSelected && "opacity-20",
                  isToday && !isSelected && "border-sky-200"
                )}
              >
                <span className="text-[11px] font-black leading-none">{format(day, 'd')}</span>
                {total !== 0 && (
                  <span className={cn(
                    "text-[8px] font-black leading-[1] truncate w-[90%] text-center",
                    isSelected ? "text-white" : (total > 0 ? "text-emerald-500" : "text-rose-400")
                  )}>
                    {total > 0 ? '+' : ''}{Math.round(total)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Transaction Form */}
      <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="space-y-1">
            <h3 className="text-xl font-black tracking-tighter text-slate-900">
              {editingId ? '修改紀錄' : '新增紀錄'}
            </h3>
            <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">
              {format(selectedDate, 'MMM do', { locale: zhHK })}
            </p>
          </div>
        </div>
        
        <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-2">
          <button
            onClick={() => setType('expense')}
            className={cn(
              "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              type === 'expense' ? 'bg-white text-rose-500 shadow-sm' : 'text-slate-400'
            )}
          >
            支出
          </button>
          <button
            onClick={() => setType('income')}
            className={cn(
              "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              type === 'income' ? 'bg-white text-emerald-500 shadow-sm' : 'text-slate-400'
            )}
          >
            收入
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">金額 (HKD)</label>
              <button 
                onClick={() => setShowCurrency(!showCurrency)}
                className="text-[9px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-1"
              >
                <Globe className="w-2.5 h-2.5" /> 匯率
              </button>
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-slate-900 transition-all font-black text-lg text-center"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">類別</label>
              <button 
                type="button"
                onClick={() => setIsEditingCategories(!isEditingCategories)}
                className="text-[9px] font-black text-sky-500 uppercase tracking-widest flex items-center gap-1 hover:text-sky-600"
              >
                {isEditingCategories ? '完成編輯' : '編輯常用'}
              </button>
            </div>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="輸入或選擇類別"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-slate-900 transition-all font-bold text-sm text-center"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {categories.map(cat => (
                <div key={cat} className="relative group flex">
                  <button
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border",
                      category === cat ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 shadow-sm"
                    )}
                  >
                    {cat}
                  </button>
                  {isEditingCategories && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const newCats = categories.filter(c => c !== cat);
                        setCategories(newCats);
                        localStorage.setItem('monmon_categories', JSON.stringify(newCats));
                        if (category === cat) setCategory('');
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center animate-in zoom-in shadow-sm cursor-pointer z-10"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
              {isEditingCategories && (
                <button 
                  type="button"
                  onClick={() => {
                    setCategories(DEFAULT_CATEGORIES);
                    localStorage.setItem('monmon_categories', JSON.stringify(DEFAULT_CATEGORIES));
                  }}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-slate-50 text-slate-400 border border-transparent hover:text-slate-600 underline"
                >
                  重置預設
                </button>
              )}
            </div>
          </div>
        </div>

        {showCurrency && (
          <div className="p-5 bg-sky-50 rounded-3xl border border-sky-100 animate-in zoom-in-95 duration-200 flex gap-3 items-center">
             <select
               value={selectedCurrency}
               onChange={(e) => setSelectedCurrency(e.target.value)}
               className="bg-white px-3 py-2 rounded-xl text-xs font-black border-none outline-none shadow-sm"
             >
               {currs.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
             <input
               type="number"
               placeholder="外幣金額"
               value={foreignAmount}
               onChange={(e) => setForeignAmount(e.target.value)}
               className="flex-1 px-4 py-2 bg-white rounded-xl border-none outline-none text-xs font-bold text-center"
             />
             <button
               onClick={applyCurrency}
               className="px-4 py-2 bg-sky-500 text-white rounded-xl text-[10px] font-black uppercase"
             >
               換算
             </button>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">備註</label>
          <input
            type="text"
            placeholder="項目名稱或備註"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-slate-900 transition-all font-bold text-sm text-center"
          />
        </div>

        <div className="flex gap-3">
          {editingId && (
            <button
              onClick={() => setEditingId(null)}
              className="flex-1 py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
            >
              取消
            </button>
          )}
          <button
            onClick={handleAdd}
            className="flex-[2] py-5 bg-sky-500 text-white rounded-[32px] font-black uppercase tracking-[0.2em] text-xs hover:bg-sky-600 active:scale-95 transition-all shadow-xl shadow-sky-100"
          >
            {editingId ? '保存更改' : '保存明細'}
          </button>
        </div>
      </div>

      {/* Transaction List */}
      <div className="space-y-4 pb-24">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 italic">最近紀錄</h3>
        {transactions.map((t) => (
          <div
            key={t.id}
            className="group bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl", t.type === 'income' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500')}>
                {t.type === 'income' ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
              </div>
              <div className="space-y-0.5">
                <p className="font-black text-slate-900 text-base">
                  {t.remark || t.category}
                  {t.foreignAmount && (
                    <span className="ml-2 text-[8px] font-black text-slate-300 border border-slate-100 px-1.5 py-0.5 rounded-lg">
                      {t.foreignCurrency} {t.foreignAmount.toLocaleString()}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.category}</span>
                  <span className="text-[10px] font-medium text-slate-200">•</span>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{t.dateStr}</span>
                </div>
              </div>
            </div>
            {/* 右側：金額 + 編輯/刪除按鈕（桌面版 hover 顯示，手機版永遠可見） */}
            <div className="flex items-center gap-2">
              <p className={cn("font-black text-lg tabular-nums", t.type === 'income' ? 'text-emerald-500' : 'text-slate-900')}>
                {t.type === 'income' ? '+' : ''}${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <div className="flex flex-col gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                <button
                  onClick={() => handleEdit(t)}
                  className="p-2 bg-slate-50 text-slate-400 hover:text-sky-500 active:text-sky-500 rounded-lg"
                  title="編輯"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (confirm('確定刪除此紀錄？')) handleDelete(t.id);
                  }}
                  className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 active:text-rose-500 rounded-lg"
                  title="刪除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stats and Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm flex flex-col items-center mb-8">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 w-full text-center italic">支出分佈</h3>
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 w-full px-4">
            {chartData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-[11px] font-bold text-slate-500">{item.name}</span>
                </div>
                <span className="text-[11px] font-black text-slate-900">${item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
