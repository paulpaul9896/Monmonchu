import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, orderBy, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { Repeat, Trash2, Calendar, DollarSign, ArrowUpCircle, ArrowDownCircle, Pencil } from 'lucide-react';
// 用 date-fns format 取本地日期，避免 UTC 偏移導致日期錯誤
import { format } from 'date-fns';

// 取今日本地日期字串（YYYY-MM-DD）
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  freq: 'monthly' | 'yearly';
  type: 'expense' | 'income';
  date: string;
  userId: string;
}

export const Recurring: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<'monthly' | 'yearly'>('monthly');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  // 預設選今日，避免日期欄位顯示空白（會令手機版 date input 出現錯誤提示）
  const [date, setDate] = useState<string>(todayStr);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Salary state
  const [monthlySalary, setMonthlySalary] = useState<string>(() => localStorage.getItem('monmon_m_salary') || '');
  const [yearlySalary, setYearlySalary] = useState<string>(() => localStorage.getItem('monmon_y_salary') || '');

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'recurring'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RecurringItem[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'recurring', user);
    });
    return unsubscribe;
  }, [user]);

  const handleSalaryChange = (val: string, period: 'm' | 'y') => {
    if (period === 'm') {
      setMonthlySalary(val);
      const y = val ? (parseFloat(val) * 12).toString() : '';
      setYearlySalary(y);
      localStorage.setItem('monmon_m_salary', val);
      localStorage.setItem('monmon_y_salary', y);
    } else {
      setYearlySalary(val);
      const m = val ? (parseFloat(val) / 12).toFixed(0).toString() : '';
      setMonthlySalary(m);
      localStorage.setItem('monmon_y_salary', val);
      localStorage.setItem('monmon_m_salary', m);
    }
  };

  const handleAdd = async () => {
    if (!user || !name || !amount) return;
    // 日期欄位為空時用本地今日，避免 UTC 偏移問題
    const saveDate = date || todayStr();
    try {
      if (editingId) {
        const itemRef = doc(db, 'recurring', editingId);
        await updateDoc(itemRef, {
          name,
          amount: parseFloat(amount),
          freq,
          type,
          date: saveDate,
        });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'recurring'), {
          name,
          amount: parseFloat(amount),
          freq,
          type,
          date: saveDate,
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      // 保存後重設所有欄位，日期重設為今日
      setName('');
      setAmount('');
      setDate(todayStr());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'recurring', user);
    }
  };

  const handleEdit = (item: RecurringItem) => {
    window.scrollTo({ top: 300, behavior: 'smooth' });
    setEditingId(item.id);
    setName(item.name);
    setAmount(item.amount.toString());
    setFreq(item.freq);
    setType(item.type);
    // 如項目日期為空則用今日，避免 date input 顯示錯誤
    setDate(item.date || todayStr());
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'recurring', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'recurring', user);
    }
  };

  const totals = items.reduce((acc, i) => {
    const mVal = i.freq === 'monthly' ? i.amount : i.amount / 12;
    const yVal = i.freq === 'yearly' ? i.amount : i.amount * 12;
    
    if (i.type === 'income') {
      acc.mNet += mVal;
      acc.yNet += yVal;
    } else {
      acc.mNet -= mVal;
      acc.yNet -= yVal;
      acc.mExp += mVal;
      acc.yExp += yVal;
    }
    return acc;
  }, { mNet: parseFloat(monthlySalary || '0'), yNet: parseFloat(yearlySalary || '0'), mExp: 0, yExp: 0 });

  const salaryUsage = parseFloat(yearlySalary) > 0 ? (totals.yExp / parseFloat(yearlySalary)) * 100 : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-amber-500 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
         <div className="grid grid-cols-2 gap-4 relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100 opacity-60">月度淨餘額</p>
              <h2 className="text-3xl font-black tracking-tighter">
                ${totals.mNet.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </h2>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100 opacity-60">預算年薪 (淨額)</p>
              <h2 className="text-3xl font-black tracking-tighter">
                ${totals.yNet.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </h2>
            </div>
         </div>
         
         <div className="mt-8 bg-white/10 rounded-3xl p-6 border border-white/10 space-y-4">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-amber-50">
              <span>薪資支出佔用率</span>
              <span>{salaryUsage.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-black/10 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-white transition-all duration-1000" 
                 style={{ width: `${Math.min(salaryUsage, 100)}%` }}
               />
            </div>
            <div className="flex justify-between items-center text-[9px] font-bold text-amber-100 italic">
               <span>月薪: ${parseFloat(monthlySalary || '0').toLocaleString()}</span>
               <span>年薪餘額: ${totals.yNet.toLocaleString()}</span>
            </div>
         </div>
      </div>

      {/* Salary Settings */}
      <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-6">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic text-center">薪資設定</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-1">月薪 (HKD)</label>
            <input
              type="number"
              placeholder="月薪"
              value={monthlySalary}
              onChange={(e) => handleSalaryChange(e.target.value, 'm')}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-500 transition-all font-black text-center"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-1">年薪 (自動)</label>
            <input
              type="number"
              placeholder="年薪"
              value={yearlySalary}
              onChange={(e) => handleSalaryChange(e.target.value, 'y')}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-500 transition-all font-black text-center"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
            {editingId ? '修改定期項目' : '新增定期項目'}
          </h3>
          {editingId && (
            <button onClick={() => {
              setEditingId(null);
              setName('');
              setAmount('');
              setDate(todayStr());
            }} className="text-[10px] font-bold text-slate-400 hover:text-slate-900">
              取消
            </button>
          )}
        </div>
        <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-2">
          <button
            onClick={() => setFreq('monthly')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${freq === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
          >
            每月
          </button>
          <button
            onClick={() => setFreq('yearly')}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${freq === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
          >
            每年
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setType('expense')}
            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${type === 'expense' ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white border-transparent text-slate-400'}`}
          >
            支出
          </button>
          <button
            onClick={() => setType('income')}
            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${type === 'income' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : 'bg-white border-transparent text-slate-400'}`}
          >
            收入
          </button>
        </div>

          <div className="space-y-4">
          <input
            type="text"
            placeholder="項目名稱 (例如: Netflix)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-500 transition-all font-bold text-sm text-center"
          />
          {/* 金額欄位單獨一行，更易輸入 */}
          <input
            type="number"
            placeholder="金額"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-500 transition-all font-black text-lg text-center"
          />
          {/* 日期欄位改為全寬，手機版 date picker 更易操作 */}
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-1">
              生效日期
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-amber-500 transition-all font-bold text-sm text-center"
            />
          </div>
          <button
            onClick={handleAdd}
            className="w-full py-5 bg-amber-500 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
          >
            {editingId ? '保存更改' : '保存定期項目'}
          </button>
        </div>
      </div>

      <div className="space-y-4 pb-20">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">定期清單</h3>
        {items.map(item => (
           <div key={item.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
             <div className="flex items-center gap-4">
               <div className={cn("p-3 rounded-2xl", item.type === 'income' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500")}>
                 <Repeat className="w-5 h-5" />
               </div>
               <div>
                 <p className="font-black text-slate-900">{item.name}</p>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.freq === 'monthly' ? '每月' : '每年'} • {item.date}</p>
               </div>
             </div>
             <div className="flex items-center gap-4">
                <p className={cn("font-black text-lg", item.type === 'income' ? "text-emerald-500" : "text-slate-900")}>
                  {item.type === 'income' ? '+' : ''}${item.amount.toLocaleString()}
                </p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => handleEdit(item)}
                    className="w-10 h-10 bg-slate-50 text-slate-300 hover:bg-sky-50 hover:text-sky-500 rounded-xl flex items-center justify-center"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="w-10 h-10 bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-xl flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
             </div>
           </div>
        ))}
      </div>
    </div>
  );
};
