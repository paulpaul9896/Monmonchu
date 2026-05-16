import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp, deleteDoc, doc, updateDoc, getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { Repeat, Trash2, ArrowUpCircle, ArrowDownCircle, Pencil } from 'lucide-react';
import { format } from 'date-fns';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

// 本月第一天 YYYY-MM-DD
const firstOfCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  freq: 'monthly' | 'yearly';
  type: 'expense' | 'income';
  date: string;          // 生效日期 YYYY-MM-DD
  userId: string;
  endType?: 'ongoing' | 'date';  // 結束條件
  endDate?: string;              // 結束月份 YYYY-MM（endType === 'date' 時使用）
}

export const Recurring: React.FC = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<RecurringItem[]>([]);

  // 表單狀態
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<'monthly' | 'yearly'>('monthly');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [date, setDate] = useState<string>(todayStr);
  const [endType, setEndType] = useState<'ongoing' | 'date'>('ongoing');
  const [endDate, setEndDate] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [monthlySalary, setMonthlySalary] = useState<string>(() => localStorage.getItem('monmon_m_salary') || '');
  const [yearlySalary, setYearlySalary]   = useState<string>(() => localStorage.getItem('monmon_y_salary') || '');

  // 防止重複觸發初次同步
  const syncedOnMountRef = useRef(false);

  // ── 監聽定期清單 ──
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'recurring'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap =>
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })) as RecurringItem[])
    , err => handleFirestoreError(err, OperationType.LIST, 'recurring', user));
    return unsub;
  }, [user]);

  // ── 首次載入後自動同步全部定期項目到帳本 ──
  useEffect(() => {
    if (syncedOnMountRef.current || items.length === 0 || !user) return;
    syncedOnMountRef.current = true;
    items.forEach(item => syncRecurringToExpenses(item));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, user?.uid]);

  // ── 薪資設定 ──
  const handleSalaryChange = (val: string, period: 'm' | 'y') => {
    if (period === 'm') {
      setMonthlySalary(val);
      const y = val ? (parseFloat(val) * 12).toString() : '';
      setYearlySalary(y);
      localStorage.setItem('monmon_m_salary', val);
      localStorage.setItem('monmon_y_salary', y);
    } else {
      setYearlySalary(val);
      const m = val ? (parseFloat(val) / 12).toFixed(0) : '';
      setMonthlySalary(m);
      localStorage.setItem('monmon_y_salary', val);
      localStorage.setItem('monmon_m_salary', m);
    }
  };

  // ══════════════════════════════════════════════════
  // 核心：將定期項目同步生成帳本記錄（幂等）
  // ══════════════════════════════════════════════════
  const syncRecurringToExpenses = async (item: RecurringItem) => {
    if (!user) return;
    try {
      // 查詢已存在的自動生成記錄（按 recurringId）
      const q = query(
        collection(db, 'expenses'),
        where('recurringId', '==', item.id)
      );
      const snapshot = await getDocs(q);
      const existingDates = new Set(snapshot.docs.map(d => d.data().dateStr as string));

      // 解析起始日期
      const [sy, sm, sd] = item.date.split('-').map(Number);
      const startDate = new Date(sy, sm - 1, sd);
      const today = new Date();

      // 計算上限日期（endDate 或今天，取較早者）
      let endLimit = today;
      if (item.endType === 'date' && item.endDate) {
        const [ey, em] = item.endDate.split('-').map(Number);
        // 結束月份的對應日，例如 2026-08 → 2026-08-{sd}
        const endDateObj = new Date(ey, em - 1, sd);
        if (endDateObj < endLimit) endLimit = endDateObj;
      }

      const datesToCreate: string[] = [];

      if (item.freq === 'monthly') {
        // 從生效月份逐月推進，直到上限
        let cur = new Date(sy, sm - 1, sd);
        while (cur <= endLimit) {
          const dateStr = format(cur, 'yyyy-MM-dd');
          if (!existingDates.has(dateStr)) datesToCreate.push(dateStr);
          cur = new Date(cur.getFullYear(), cur.getMonth() + 1, sd);
        }
      } else {
        // 每年：從起始年到上限年
        for (let y = startDate.getFullYear(); y <= endLimit.getFullYear(); y++) {
          const d = new Date(y, sm - 1, sd);
          if (d >= startDate && d <= endLimit) {
            const dateStr = format(d, 'yyyy-MM-dd');
            if (!existingDates.has(dateStr)) datesToCreate.push(dateStr);
          }
        }
      }

      // 批量建立缺失的帳本記錄
      await Promise.all(datesToCreate.map(dateStr =>
        addDoc(collection(db, 'expenses'), {
          amount: item.amount,
          category: item.name,
          type: item.type,
          remark: `[定期] ${item.name}`,
          dateStr,
          userId: user.uid,
          recurringId: item.id,     // 標記來源
          createdAt: serverTimestamp(),
        })
      ));
    } catch (err) {
      console.error('Recurring sync error:', err);
    }
  };

  // ── 新增 / 修改定期項目 ──
  const handleAdd = async () => {
    if (!user || !name || !amount) return;
    const saveDate = date || todayStr();
    const itemData: Record<string, unknown> = {
      name,
      amount: parseFloat(amount),
      freq,
      type,
      date: saveDate,
      endType,
      // 只在設定結束日期時儲存 endDate
      ...(endType === 'date' && endDate ? { endDate } : {}),
    };

    try {
      let savedId = editingId;

      if (editingId) {
        await updateDoc(doc(db, 'recurring', editingId), itemData);
      } else {
        const ref = await addDoc(collection(db, 'recurring'), {
          ...itemData,
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
        savedId = ref.id;
      }

      // 同步至帳本（包含此次更改後的配置）
      if (savedId) {
        await syncRecurringToExpenses({
          id: savedId,
          name,
          amount: parseFloat(amount),
          freq,
          type,
          date: saveDate,
          userId: user.uid,
          endType,
          endDate: endType === 'date' ? endDate : undefined,
        });
      }

      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'recurring', user);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName(''); setAmount(''); setDate(todayStr());
    setEndType('ongoing'); setEndDate('');
  };

  const handleEdit = (item: RecurringItem) => {
    window.scrollTo({ top: 300, behavior: 'smooth' });
    setEditingId(item.id);
    setName(item.name);
    setAmount(item.amount.toString());
    setFreq(item.freq);
    setType(item.type);
    setDate(item.date || todayStr());
    setEndType(item.endType || 'ongoing');
    setEndDate(item.endDate || '');
  };

  const handleDelete = async (id: string) => {
    try { await deleteDoc(doc(db, 'recurring', id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, 'recurring', user); }
  };

  // ── 統計計算 ──
  const totals = items.reduce((acc, i) => {
    const mVal = i.freq === 'monthly' ? i.amount : i.amount / 12;
    const yVal = i.freq === 'yearly'  ? i.amount : i.amount * 12;
    if (i.type === 'income') { acc.mNet += mVal; acc.yNet += yVal; }
    else { acc.mNet -= mVal; acc.yNet -= yVal; acc.mExp += mVal; acc.yExp += yVal; }
    return acc;
  }, { mNet: parseFloat(monthlySalary || '0'), yNet: parseFloat(yearlySalary || '0'), mExp: 0, yExp: 0 });

  const salaryUsage = parseFloat(yearlySalary) > 0 ? (totals.yExp / parseFloat(yearlySalary)) * 100 : 0;

  // 結束月份最小值：本月
  const minEndMonth = format(new Date(), 'yyyy-MM');

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── 概覽卡片 ── */}
      <div className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #92400e 0%, #d97706 60%, #fbbf24 100%)' }}>
        <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #fff, transparent)' }} />
        <div className="relative z-10">
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <p className="text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-1">月度淨餘額</p>
              <p className="font-black tabular-nums" style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)' }}>
                ${totals.mNet.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-1">年薪淨額</p>
              <p className="font-black tabular-nums" style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)' }}>
                ${totals.yNet.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </p>
            </div>
          </div>
          <div className="bg-black/15 rounded-[16px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-white/60 uppercase tracking-widest">薪資支出佔用率</span>
              <span className="text-[11px] font-bold text-white">{salaryUsage.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(salaryUsage, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] font-medium text-white/50">
              <span>月薪 ${parseFloat(monthlySalary || '0').toLocaleString()}</span>
              <span>餘額 ${totals.yNet.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 薪資設定 ── */}
      <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm">
        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4">薪資設定</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-400">月薪 (HKD)</label>
            <input type="number" placeholder="月薪" value={monthlySalary}
              onChange={e => handleSalaryChange(e.target.value, 'm')}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-amber-400 font-bold text-sm text-center transition-all" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-400">年薪 (自動計算)</label>
            <input type="number" placeholder="年薪" value={yearlySalary}
              onChange={e => handleSalaryChange(e.target.value, 'y')}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-amber-400 font-bold text-sm text-center transition-all" />
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-3 text-center">
          月薪將於每月 1 號自動加入帳本
        </p>
      </div>

      {/* ── 新增 / 修改定期項目 ── */}
      <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-slate-900">
            {editingId ? '修改定期項目' : '新增定期項目'}
          </h3>
          {editingId && (
            <button onClick={resetForm} className="text-[12px] font-semibold text-slate-400">取消</button>
          )}
        </div>

        {/* 每月 / 每年 */}
        <div className="flex bg-[#F2F2F7] p-1 rounded-[14px] gap-1">
          {(['monthly', 'yearly'] as const).map(f => (
            <button key={f} onClick={() => setFreq(f)}
              className={cn("flex-1 py-2.5 rounded-[11px] text-[13px] font-semibold transition-all",
                freq === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}>
              {f === 'monthly' ? '每月' : '每年'}
            </button>
          ))}
        </div>

        {/* 支出 / 收入 */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setType('expense')}
            className={cn("py-2.5 rounded-[12px] text-[13px] font-semibold border transition-all",
              type === 'expense' ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-[#F2F2F7] border-transparent text-slate-400")}>
            支出
          </button>
          <button onClick={() => setType('income')}
            className={cn("py-2.5 rounded-[12px] text-[13px] font-semibold border transition-all",
              type === 'income' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-[#F2F2F7] border-transparent text-slate-400")}>
            收入
          </button>
        </div>

        {/* 名稱 */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">名稱</label>
          <input type="text" placeholder="例如: Netflix、房租..." value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-amber-400 font-semibold text-sm transition-all" />
        </div>

        {/* 金額 */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">金額 (HKD)</label>
          <input type="number" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-4 py-4 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-amber-400 font-black text-2xl text-center tabular-nums transition-all" />
        </div>

        {/* 生效日期 */}
        <div className="space-y-1.5 min-w-0 overflow-hidden">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">生效日期</label>
          <input type="date" value={date}
            onChange={e => { if (e.target.value) setDate(e.target.value); }}
            className="w-full min-w-0 max-w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-amber-400 font-semibold text-sm transition-all" />
        </div>

        {/* ── 結束條件 ── */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">結束條件</label>
          <div className="flex bg-[#F2F2F7] p-1 rounded-[14px] gap-1">
            {(['ongoing', 'date'] as const).map(e => (
              <button key={e} onClick={() => setEndType(e)}
                className={cn("flex-1 py-2.5 rounded-[11px] text-[12px] font-semibold transition-all",
                  endType === e ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}>
                {e === 'ongoing' ? '持續進行' : '設定結束月份'}
              </button>
            ))}
          </div>

          {endType === 'date' && (
            <div className="min-w-0 overflow-hidden">
              <input
                type="month"
                value={endDate}
                min={minEndMonth}
                onChange={e => setEndDate(e.target.value)}
                className="w-full min-w-0 max-w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-[14px] outline-none focus:ring-2 focus:ring-amber-400 font-semibold text-sm transition-all text-amber-800"
              />
              {endDate && (
                <p className="text-[10px] text-amber-600 font-medium mt-1.5 px-1">
                  將在 {endDate.replace('-', ' 年 ')} 月後停止自動記帳
                </p>
              )}
            </div>
          )}
        </div>

        <button onClick={handleAdd}
          className="w-full py-4 bg-amber-500 text-white rounded-[16px] font-bold text-[15px] active:scale-[0.98] transition-all shadow-lg shadow-amber-100">
          {editingId ? '保存更改' : '保存定期項目'}
        </button>
      </div>

      {/* ── 定期清單 ── */}
      <div className="space-y-2 pb-24">
        <h3 className="text-[13px] font-semibold text-slate-400 px-1 mb-1">定期清單</h3>
        {items.map(item => (
          <div key={item.id} className="group bg-white rounded-[20px] border border-black/[0.05] shadow-sm px-4 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0",
                  item.type === 'income' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500")}>
                  {item.type === 'income' ? <ArrowUpCircle className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] text-slate-900 truncate">{item.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {item.freq === 'monthly' ? '每月' : '每年'} · {item.date}
                    {item.endType === 'date' && item.endDate && (
                      <span className="ml-1.5 text-amber-500 font-semibold">至 {item.endDate}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                <p className={cn("font-bold text-[15px] tabular-nums",
                  item.type === 'income' ? "text-emerald-500" : "text-slate-900")}>
                  {item.type === 'income' ? '+' : ''}${item.amount.toLocaleString()}
                </p>
                <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                  <button onClick={() => handleEdit(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 active:text-sky-500 bg-slate-50">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 active:text-rose-500 bg-slate-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="py-12 text-center text-slate-300 italic text-sm">尚未新增定期項目</div>
        )}
      </div>
    </div>
  );
};
