import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, onSnapshot, addDoc, serverTimestamp,
  deleteDoc, doc, updateDoc, arrayUnion, getDoc, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import {
  Plus, Trash2, ArrowRight, UserPlus, Pencil,
  QrCode, Copy, ChevronLeft, ChevronRight, X, Scan, Globe
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
// 直接用 Html5Qrcode 控制後置鏡頭
import { Html5Qrcode } from 'html5-qrcode';
import {
  format, isSameDay, startOfMonth, endOfMonth,
  eachDayOfInterval, startOfWeek, endOfWeek, subMonths, addMonths
} from 'date-fns';
import { zhHK } from 'date-fns/locale';

interface SplitItem {
  id: string;
  desc: string;
  amount: number;
  payer: string;
  participants: string[];
  date: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
}

interface SplitProject {
  id: string;
  name: string;
  members: string[];
  items: SplitItem[];
  createdBy: string;
}

// 取本地今日 YYYY-MM-DD（en-CA locale 輸出格式正確）
const todayLocal = () => new Date().toLocaleDateString('en-CA');

export const SplitBill: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<SplitProject[]>([]);
  const [activeProject, setActiveProject] = useState<SplitProject | null>(null);

  // 建立計畫
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newMembers, setNewMembers] = useState(['', '']);

  // Tab 切換
  const [viewTab, setViewTab] = useState<'overview' | 'details'>('overview');

  // QR Code
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 加入計畫
  const [joinId, setJoinId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  // 加明細表單
  const [itemDesc, setItemDesc] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemPayer, setItemPayer] = useState('');
  const [itemParts, setItemParts] = useState<string[]>([]);
  const [itemDate, setItemDate] = useState(todayLocal());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // 外幣換算
  const defaultRates: Record<string, number> = {
    HKD: 1, JPY: 19.95, USD: 0.128, TWD: 4.14, EUR: 0.118, CNY: 0.92, KRW: 175
  };
  const [rates, setRates] = useState<Record<string, number>>(defaultRates);
  const [fromCurrency, setFromCurrency] = useState('JPY');
  const [originalAmount, setOriginalAmount] = useState('');
  const [showExchange, setShowExchange] = useState(false);

  const currencies = [
    { code: 'HKD', flag: '🇭🇰' }, { code: 'JPY', flag: '🇯🇵' }, { code: 'USD', flag: '🇺🇸' },
    { code: 'TWD', flag: '🇹🇼' }, { code: 'EUR', flag: '🇪🇺' }, { code: 'CNY', flag: '🇨🇳' },
    { code: 'KRW', flag: '🇰🇷' },
  ];

  // 日曆
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // ── 第一次進入計畫時，預選全部成員 ──
  useEffect(() => {
    if (activeProject && !editingItemId && itemParts.length === 0) {
      setItemParts(activeProject.members);
    }
  }, [activeProject?.id, editingItemId]);

  // ── 拉匯率 ──
  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/HKD')
      .then(r => r.json())
      .then(d => { if (d?.rates) setRates(d.rates); })
      .catch(() => {});
  }, []);

  // ── 監聽計畫列表 ──
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'split_projects'), where('authorizedUsers', 'array-contains', user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as SplitProject[];
      setProjects(data);
      if (activeProject) {
        const updated = data.find(p => p.id === activeProject.id);
        if (updated) setActiveProject(updated);
      }
    }, err => handleFirestoreError(err, OperationType.LIST, 'split_projects', user));
    return unsub;
  }, [user, activeProject?.id]);

  // ── QR 掃描器（後置鏡頭）──
  useEffect(() => {
    if (!showScanner) {
      if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
      return;
    }
    const timer = setTimeout(() => {
      const qr = new Html5Qrcode('reader');
      scannerRef.current = qr;
      const onSuccess = (text: string) => { setJoinId(text); setShowScanner(false); };
      qr.start({ facingMode: { exact: 'environment' } }, { fps: 10, qrbox: { width: 250, height: 250 } }, onSuccess, () => {})
        .catch(() => {
          qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, onSuccess, () => {})
            .catch(console.error);
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [showScanner]);

  // ── 建立計畫 ──
  const handleCreateProject = async () => {
    if (!user || !newName) return;
    const members = newMembers.filter(m => m.trim() !== '');
    if (members.length < 2) return;
    try {
      await addDoc(collection(db, 'split_projects'), {
        name: newName, password: newPassword, members, items: [],
        createdBy: user.uid, authorizedUsers: [user.uid], createdAt: serverTimestamp(),
      });
      setShowCreate(false); setNewName(''); setNewPassword(''); setNewMembers(['', '']);
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'split_projects', user); }
  };

  // ── 外幣換算 ──
  const calculateConverted = () => {
    if (!originalAmount || !rates[fromCurrency]) return '';
    return (parseFloat(originalAmount) / rates[fromCurrency]).toFixed(2);
  };
  const applyConversion = () => {
    const v = calculateConverted();
    if (v) { setItemAmount(v); setShowExchange(false); }
    else alert('無法計算，請檢查網路連接');
  };

  // ── 加入 / 修改明細（關鍵修復）──
  const handleAddItem = async () => {
    if (!activeProject) return;
    if (!itemAmount || parseFloat(itemAmount) <= 0) { alert('請輸入金額'); return; }
    if (!itemPayer) { alert('請選擇付款人'); return; }
    if (itemParts.length === 0) { alert('請選擇參與成員'); return; }

    const newItemBase = {
      desc: itemDesc || '共同開支',
      amount: parseFloat(itemAmount),
      payer: itemPayer,
      participants: itemParts,
      date: itemDate,
      originalAmount: originalAmount ? parseFloat(originalAmount) : undefined,
      originalCurrency: originalAmount ? fromCurrency : undefined,
      exchangeRate: originalAmount ? (1 / rates[fromCurrency]) : undefined,
    };

    let updatedItems = [...activeProject.items];
    if (editingItemId) {
      updatedItems = updatedItems.map(i => i.id === editingItemId ? { ...i, ...newItemBase } : i);
    } else {
      updatedItems.push({ id: `${Date.now()}${Math.random().toString(36).substr(2, 4)}`, ...newItemBase } as SplitItem);
    }

    try {
      await updateDoc(doc(db, 'split_projects', activeProject.id), { items: updatedItems });
      // 保存後重設表單，itemParts 保持全選（方便連續輸入）
      setItemDesc(''); setItemAmount(''); setItemPayer('');
      setItemParts(activeProject.members);
      setOriginalAmount(''); setShowExchange(false);
      setItemDate(todayLocal()); setEditingItemId(null);
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'split_projects', user); }
  };

  const handleEditItem = (item: SplitItem) => {
    setEditingItemId(item.id); setItemDesc(item.desc);
    setItemAmount(item.amount.toString()); setItemPayer(item.payer);
    setItemParts(item.participants); setItemDate(item.date);
    setOriginalAmount(item.originalAmount?.toString() || '');
    setFromCurrency(item.originalCurrency || 'HKD');
    setViewTab('details');
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeProject) return;
    const updatedItems = activeProject.items.filter(i => i.id !== itemId);
    try {
      await updateDoc(doc(db, 'split_projects', activeProject.id), { items: updatedItems });
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'split_projects', user); }
  };

  const handleJoinProject = async () => {
    if (!user || !joinId) return;
    try {
      const ref = doc(db, 'split_projects', joinId);
      const snap = await getDoc(ref);
      if (!snap.exists()) { alert('找不到該計畫！'); return; }
      const d = snap.data();
      if (d.password && d.password !== joinPassword) { alert('密碼錯誤！'); return; }
      if (!d.authorizedUsers?.includes(user.uid)) await updateDoc(ref, { authorizedUsers: arrayUnion(user.uid) });
      setShowJoin(false); setJoinId(''); setJoinPassword('');
    } catch (err) { handleFirestoreError(err, OperationType.WRITE, 'split_projects', user); }
  };

  const handleDeleteProject = async () => {
    if (!activeProject || !user) return;
    if (!confirm('確定要刪除整個計畫嗎？')) return;
    try {
      await deleteDoc(doc(db, 'split_projects', activeProject.id));
      setActiveProject(null);
    } catch (err) { handleFirestoreError(err, OperationType.DELETE, 'split_projects', user); }
  };

  // ── 計算結餘 ──
  const calculateBalances = (project: SplitProject) => {
    const b: Record<string, number> = {};
    project.members.forEach(m => { b[m] = 0; });
    project.items.forEach(item => {
      const share = item.amount / item.participants.length;
      b[item.payer] += item.amount;
      item.participants.forEach(p => { b[p] -= share; });
    });
    return b;
  };

  const calculateSettlement = (balances: Record<string, number>) => {
    const debtors:   { n: string; a: number }[] = [];
    const creditors: { n: string; a: number }[] = [];
    Object.entries(balances).forEach(([n, a]) => {
      if (a < -0.01) debtors.push({ n, a: -a });
      else if (a > 0.01) creditors.push({ n, a });
    });
    const res: string[] = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].a, creditors[j].a);
      res.push(`${debtors[i].n} → ${creditors[j].n}: HK$${pay.toFixed(2)}`);
      debtors[i].a -= pay; creditors[j].a -= pay;
      if (debtors[i].a <= 0.01) i++;
      if (creditors[j].a <= 0.01) j++;
    }
    return res;
  };

  // ════════════════════════════════════════
  // 計畫內部頁面
  // ════════════════════════════════════════
  if (activeProject) {
    const balances    = calculateBalances(activeProject);
    const settlements = calculateSettlement(balances);
    const totalSpend  = activeProject.items.reduce((s, i) => s + i.amount, 0);

    // 日曆資料
    const monthStart = startOfMonth(currentMonth);
    const calDays    = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) });
    const getDayTotal = (day: Date) => {
      const ds = format(day, 'yyyy-MM-dd');
      return activeProject.items.filter(i => i.date === ds).reduce((s, i) => s + i.amount, 0);
    };

    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* 頂部導航 */}
        <div className="flex items-center justify-between">
          <button onClick={() => setActiveProject(null)} className="flex items-center gap-1 text-[14px] font-semibold text-emerald-600 active:opacity-60">
            <ChevronLeft className="w-4 h-4" /> 返回
          </button>
          <button onClick={handleDeleteProject} className="text-[12px] font-semibold text-rose-400 active:opacity-60">刪除計畫</button>
        </div>

        {/* 計畫頭部卡片 */}
        <div className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-xl"
          style={{ background: 'linear-gradient(135deg, #065f46 0%, #059669 60%, #10b981 100%)' }}>
          <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #fff, transparent)' }} />
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-1 tracking-tight">{activeProject.name}</h2>
            <p className="text-[11px] font-medium text-emerald-100/70 mb-4">
              {activeProject.members.join(' · ')} · {activeProject.items.length} 筆明細
            </p>
            <div className="flex items-end justify-between mb-5">
              <div>
                <p className="text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-1">總支出</p>
                <p className="text-3xl font-black tabular-nums">HK${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { navigator.clipboard.writeText(activeProject.id); alert('計畫 ID 已複製！'); }}
                className="flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 active:scale-95 py-2.5 rounded-[14px] text-[11px] font-semibold transition-all">
                <Copy className="w-3.5 h-3.5" /> 複製 ID
              </button>
              <button onClick={() => setShowQR(true)}
                className="flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 active:scale-95 py-2.5 rounded-[14px] text-[11px] font-semibold transition-all">
                <QrCode className="w-3.5 h-3.5" /> QR Code
              </button>
            </div>
          </div>
        </div>

        {/* Tab 切換 */}
        <div className="flex bg-[#E5E5EA] p-1 rounded-[16px] gap-1">
          {(['overview', 'details'] as const).map(t => (
            <button key={t} onClick={() => setViewTab(t)}
              className={cn("flex-1 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all",
                viewTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              )}>
              {t === 'overview' ? '📊 概覽' : '📝 明細'}
            </button>
          ))}
        </div>

        {/* ── 概覽 ── */}
        {viewTab === 'overview' && (
          <div className="space-y-3 pb-24">
            {/* 結算建議 */}
            <div className="bg-white rounded-[20px] p-5 border border-black/[0.05] shadow-sm">
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">結算建議</h4>
              {settlements.length > 0 ? settlements.map((s, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-base">💰</div>
                  <p className="text-[14px] font-semibold text-slate-700">{s}</p>
                </div>
              )) : <p className="text-sm text-slate-400 text-center py-4 italic">所有帳目已平息 ✨</p>}
            </div>

            {/* 各成員結餘 */}
            {activeProject.members.map(m => (
              <div key={m} className="bg-white rounded-[20px] px-5 py-4 border border-black/[0.05] shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-50 rounded-[10px] flex items-center justify-center text-lg font-bold text-emerald-600">
                    {m.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-[15px] text-slate-800">{m}</span>
                </div>
                <span className={cn("font-bold text-[16px] tabular-nums", balances[m] >= 0 ? "text-emerald-500" : "text-rose-500")}>
                  {balances[m] >= 0 ? '+' : ''}HK${balances[m].toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── 明細 ── */}
        {viewTab === 'details' && (
          <div className="space-y-4 pb-24">

            {/* 日曆 */}
            <div className="bg-white rounded-[20px] p-4 border border-black/[0.05] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 active:scale-90 transition-all">
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <h3 className="text-[13px] font-bold text-slate-900">
                  {format(currentMonth, 'yyyy年 M月', { locale: zhHK })}
                </h3>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 active:scale-90 transition-all">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
                ))}
                {calDays.map((day, i) => {
                  const isSelected  = isSameDay(day, selectedDate);
                  const isToday     = isSameDay(day, new Date());
                  const total       = getDayTotal(day);
                  const isThisMonth = day.getMonth() === currentMonth.getMonth();
                  return (
                    <button key={i} onClick={() => setSelectedDate(day)}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-between py-1 rounded-xl transition-all",
                        isSelected  ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                                    : isToday ? "bg-emerald-50 text-emerald-600"
                                    : "hover:bg-slate-50 text-slate-700",
                        !isThisMonth && !isSelected && "opacity-25"
                      )}>
                      <span className="text-[11px] font-semibold leading-none">{format(day, 'd')}</span>
                      {/* 消費金額縮寫，防止截斷 */}
                      {total > 0 && (
                        <span className={cn("text-[7px] font-bold leading-tight w-full text-center px-0.5",
                          isSelected ? "text-white/80" : "text-rose-400")}>
                          {total >= 10000 ? `${(total / 1000).toFixed(0)}k`
                            : total >= 1000 ? `${(total / 1000).toFixed(1)}k`
                            : Math.round(total)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 新增明細表單（重新設計，UX 清晰）── */}
            <div className="bg-white rounded-[20px] p-5 border border-black/[0.05] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-slate-900">
                  {editingItemId ? '修改明細' : '新增明細'}
                </h3>
                {editingItemId && (
                  <button onClick={() => { setEditingItemId(null); setItemPayer(''); setItemParts(activeProject.members); }}
                    className="text-[12px] font-semibold text-slate-400">取消</button>
                )}
              </div>

              {/* 項目名稱 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">項目名稱</label>
                <input type="text" placeholder="例如：晚餐、交通..." value={itemDesc}
                  onChange={e => setItemDesc(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-emerald-400 font-semibold text-sm text-slate-900 transition-all" />
              </div>

              {/* 金額（獨立一行，清晰突出）*/}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">金額 (HKD)</label>
                  <button onClick={() => setShowExchange(!showExchange)}
                    className={cn("flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all",
                      showExchange ? "bg-emerald-500 text-white" : "bg-emerald-50 text-emerald-600")}>
                    <Globe className="w-3 h-3" /> 外幣換算
                  </button>
                </div>
                <input type="number" inputMode="decimal" placeholder="0.00" value={itemAmount}
                  onChange={e => setItemAmount(e.target.value)}
                  className="w-full px-5 py-4 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-emerald-400 font-black text-2xl text-center tabular-nums text-slate-900 transition-all" />
              </div>

              {/* 外幣換算面板 */}
              {showExchange && (
                <div className="p-4 bg-emerald-50 rounded-[16px] border border-emerald-100 space-y-3">
                  <div className="flex gap-2">
                    <select value={fromCurrency} onChange={e => setFromCurrency(e.target.value)}
                      className="bg-white px-3 py-2.5 rounded-[10px] text-sm font-bold border border-emerald-100 outline-none">
                      {currencies.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                    </select>
                    <input type="number" placeholder="外幣金額" value={originalAmount}
                      onChange={e => setOriginalAmount(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-white rounded-[10px] border border-emerald-100 outline-none text-sm font-semibold text-center" />
                  </div>
                  {originalAmount && (
                    <p className="text-[12px] font-semibold text-emerald-700 text-center">
                      ≈ HKD {calculateConverted()}
                    </p>
                  )}
                  <button onClick={applyConversion}
                    className="w-full py-2.5 bg-emerald-500 text-white rounded-[12px] text-[12px] font-bold active:scale-95 transition-all">
                    套用金額
                  </button>
                </div>
              )}

              {/* 付款人（獨立一行）*/}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">付款人</label>
                <div className="flex flex-wrap gap-2">
                  {activeProject.members.map(m => (
                    <button key={m} onClick={() => setItemPayer(m)}
                      className={cn("px-4 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all border",
                        itemPayer === m
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-[#F2F2F7] text-slate-600 border-transparent hover:bg-slate-200"
                      )}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* 參與成員 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">參與成員</label>
                <div className="flex flex-wrap gap-2">
                  {activeProject.members.map(m => (
                    <button key={m}
                      onClick={() => setItemParts(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                      className={cn("px-4 py-2.5 rounded-[12px] text-[13px] font-semibold transition-all border",
                        itemParts.includes(m)
                          ? "bg-[#1C1C1E] text-white border-[#1C1C1E]"
                          : "bg-[#F2F2F7] text-slate-500 border-transparent"
                      )}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* 日期（緊湊，不佔整頁）*/}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">日期</label>
                {/* 用 max-w 限制寬度，iOS date input 不會撐整行 */}
                <input type="date" value={itemDate}
                  onChange={e => { if (e.target.value) setItemDate(e.target.value); }}
                  className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-emerald-400 font-semibold text-sm text-slate-900 transition-all" />
              </div>

              {/* 提交 */}
              <button onClick={handleAddItem}
                className="w-full py-4 bg-emerald-500 text-white rounded-[16px] font-bold text-[15px] active:scale-[0.98] transition-all shadow-lg shadow-emerald-100">
                {editingItemId ? '保存修改' : '加入明細'}
              </button>
            </div>

            {/* 明細歷史 */}
            <div className="space-y-2">
              {activeProject.items
                .filter(item => {
                  const d = new Date(item.date);
                  return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
                })
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((item, idx, arr) => {
                  const showDate = idx === 0 || item.date !== arr[idx - 1].date;
                  return (
                    <div key={item.id}>
                      {showDate && (
                        <div className="flex items-center gap-3 py-2">
                          <div className="h-px flex-1 bg-slate-100" />
                          <span className="text-[10px] font-semibold text-slate-300 uppercase">{item.date}</span>
                          <div className="h-px flex-1 bg-slate-100" />
                        </div>
                      )}
                      <div className="bg-white rounded-[18px] border border-black/[0.05] shadow-sm px-4 py-3.5 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[15px] text-slate-800 truncate">{item.desc}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{item.payer} 付款 · {item.participants.join(', ')}</p>
                          {item.originalAmount && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full mt-0.5">
                              <Globe className="w-2 h-2" />
                              {item.originalCurrency} {item.originalAmount.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                          <span className="font-bold text-[15px] tabular-nums text-slate-900">HK${item.amount.toFixed(2)}</span>
                          <button onClick={() => handleEditItem(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 active:text-emerald-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (confirm('刪除此明細？')) handleDeleteItem(item.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 active:text-rose-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* QR Modal */}
        {showQR && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-5">
            <div className="bg-white w-full max-w-sm rounded-[32px] p-8 flex flex-col items-center space-y-5 relative">
              <button onClick={() => setShowQR(false)} className="absolute top-5 right-5 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 active:scale-90">
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-[17px] font-bold">分享計畫</h3>
              <div className="p-3 bg-slate-50 rounded-[20px]">
                <QRCodeSVG value={activeProject.id} size={180} level="H" includeMargin={true} className="rounded-xl" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">計畫 ID</p>
                <p className="font-mono font-semibold text-sm text-slate-700 bg-slate-50 px-4 py-2 rounded-xl break-all">{activeProject.id}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════
  // 計畫列表頁
  // ════════════════════════════════════════
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Hero 卡片 */}
      <div className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-xl"
        style={{ background: 'linear-gradient(135deg, #065f46 0%, #059669 60%, #10b981 100%)' }}>
        <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #fff, transparent)' }} />
        <h2 className="text-[26px] font-black tracking-tight mb-1">分帳助手</h2>
        <p className="text-[12px] font-medium text-emerald-100/70">多人聚餐、旅遊開支，高效結算。</p>
      </div>

      {/* 建立 / 加入 按鈕 */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => { setShowCreate(!showCreate); setShowJoin(false); }}
          className={cn("py-5 rounded-[20px] flex flex-col items-center justify-center gap-2 font-semibold text-[12px] transition-all border-2 active:scale-95",
            showCreate ? "bg-slate-100 border-slate-200 text-slate-400" : "bg-white border-emerald-100 text-emerald-600 hover:bg-emerald-50"
          )}>
          {showCreate ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {showCreate ? '取消' : '新計畫'}
        </button>
        <button onClick={() => { setShowJoin(!showJoin); setShowCreate(false); }}
          className={cn("py-5 rounded-[20px] flex flex-col items-center justify-center gap-2 font-semibold text-[12px] transition-all border-2 active:scale-95",
            showJoin ? "bg-[#1C1C1E] border-[#1C1C1E] text-white" : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
          )}>
          <UserPlus className="w-5 h-5" />
          加入計畫
        </button>
      </div>

      {/* 加入計畫面板 */}
      {showJoin && (
        <div className="bg-[#1C1C1E] rounded-[24px] p-5 text-white space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-emerald-400 uppercase tracking-widest">加入現有計畫</h3>
            <button onClick={() => setShowScanner(!showScanner)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-semibold transition-all",
                showScanner ? "bg-rose-500 text-white" : "bg-emerald-500/20 text-emerald-300")}>
              <Scan className="w-3.5 h-3.5" />
              {showScanner ? '關閉鏡頭' : '掃 QR Code'}
            </button>
          </div>
          {showScanner && (
            <div className="overflow-hidden rounded-[16px] bg-white p-2">
              <div id="reader" className="w-full rounded-[12px] overflow-hidden"></div>
              <p className="text-[9px] font-semibold text-slate-400 text-center py-2 uppercase tracking-widest">📷 對準後置鏡頭即可掃描</p>
            </div>
          )}
          <div className="space-y-2">
            <input type="text" placeholder="計畫 ID" value={joinId} onChange={e => setJoinId(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-[14px] outline-none focus:border-emerald-500 font-semibold text-sm text-center text-white placeholder-white/30 transition-all" />
            <input type="password" placeholder="密碼（如有）" value={joinPassword} onChange={e => setJoinPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/10 rounded-[14px] outline-none focus:border-emerald-500 font-semibold text-sm text-center text-white placeholder-white/30 transition-all" />
            <button onClick={handleJoinProject}
              className="w-full py-3.5 bg-emerald-500 text-white rounded-[14px] font-bold text-[14px] active:scale-[0.98] transition-all">
              立即加入
            </button>
          </div>
        </div>
      )}

      {/* 建立計畫面板 */}
      {showCreate && (
        <div className="bg-white rounded-[24px] p-5 border border-black/[0.05] shadow-sm space-y-4">
          <h3 className="text-[13px] font-semibold text-emerald-600 uppercase tracking-widest">設定新計畫</h3>
          <div className="space-y-3">
            <input type="text" placeholder="計畫名稱（例如：東京旅行）" value={newName} onChange={e => setNewName(e.target.value)}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-emerald-400 font-semibold text-sm" />
            <input type="text" placeholder="設定密碼（選填）" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-emerald-400 font-semibold text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">成員名單</label>
            {newMembers.map((m, idx) => (
              <div key={idx} className="flex gap-2">
                <input type="text" value={m} placeholder={`成員 ${idx + 1}`}
                  onChange={e => { const u = [...newMembers]; u[idx] = e.target.value; setNewMembers(u); }}
                  className="flex-1 px-4 py-3 bg-[#F2F2F7] rounded-[14px] outline-none focus:ring-2 focus:ring-emerald-400 font-semibold text-sm" />
                {newMembers.length > 2 && (
                  <button onClick={() => setNewMembers(p => p.filter((_, i) => i !== idx))} className="w-10 h-10 bg-rose-50 text-rose-500 rounded-[10px] flex items-center justify-center active:scale-90">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setNewMembers(p => [...p, ''])}
              className="w-full py-2.5 border border-dashed border-slate-200 rounded-[12px] text-slate-400 text-[12px] font-semibold hover:border-emerald-300 hover:text-emerald-500 transition-all">
              + 新增成員
            </button>
          </div>
          <button onClick={handleCreateProject}
            className="w-full py-4 bg-emerald-500 text-white rounded-[16px] font-bold text-[15px] active:scale-[0.98] transition-all shadow-lg shadow-emerald-100">
            完成並建立
          </button>
        </div>
      )}

      {/* 計畫列表 */}
      <div className="space-y-2 pb-24">
        <h3 className="text-[13px] font-semibold text-slate-400 px-1 mb-1">最近參與的計畫</h3>
        {projects.length > 0 ? projects.map(p => (
          <button key={p.id} onClick={() => setActiveProject(p)}
            className="w-full bg-white rounded-[20px] border border-black/[0.05] shadow-sm px-5 py-4 flex items-center justify-between hover:shadow-md active:scale-[0.99] transition-all group">
            <div className="text-left">
              <h4 className="font-semibold text-[15px] text-slate-900 group-hover:text-emerald-600 transition-colors">{p.name}</h4>
              <p className="text-[12px] text-slate-400 mt-0.5">{p.members.length} 位成員 · {p.items.length} 筆明細</p>
            </div>
            <div className="w-9 h-9 bg-slate-50 rounded-[10px] flex items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-all">
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        )) : (
          <div className="py-12 text-center text-slate-300 italic text-sm">尚未參與任何計畫</div>
        )}
      </div>
    </div>
  );
};
