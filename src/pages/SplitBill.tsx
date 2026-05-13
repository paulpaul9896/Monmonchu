import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, arrayUnion, getDoc, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { Users, Plus, Trash2, ArrowRight, CheckCircle2, UserPlus, Info, Pencil, QrCode, Copy, ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, Scan, Globe, TrendingUp } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, subMonths, addMonths } from 'date-fns';
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

export const SplitBill: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<SplitProject[]>([]);
  const [activeProject, setActiveProject] = useState<SplitProject | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newMembers, setNewMembers] = useState(['', '']);
  const [viewTab, setViewTab] = useState<'overview' | 'details'>('overview');
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Join functionality
  const [joinId, setJoinId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  // Add Item form state
  const [itemDesc, setItemDesc] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemPayer, setItemPayer] = useState('');
  const [itemParts, setItemParts] = useState<string[]>([]);
  const [itemDate, setItemDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Currency features
  const defaultRates: Record<string, number> = {
    HKD: 1,
    JPY: 19.95,
    USD: 0.128,
    TWD: 4.14,
    EUR: 0.118,
    CNY: 0.92,
    KRW: 175
  };
  const [rates, setRates] = useState<Record<string, number>>(defaultRates);
  const [fromCurrency, setFromCurrency] = useState('JPY');
  const [originalAmount, setOriginalAmount] = useState('');
  const [showExchange, setShowExchange] = useState(false);

  useEffect(() => {
    if (activeProject && !editingItemId && itemParts.length === 0) {
      setItemParts(activeProject.members);
    }
  }, [activeProject?.id, editingItemId]);

  const currencies = [
    { code: 'HKD', name: '港幣', flag: '🇭🇰' },
    { code: 'JPY', name: '日圓', flag: '🇯🇵' },
    { code: 'USD', name: '美元', flag: '🇺🇸' },
    { code: 'TWD', name: '台幣', flag: '🇹🇼' },
    { code: 'EUR', name: '歐元', flag: '🇪🇺' },
    { code: 'CNY', name: '人民幣', flag: '🇨🇳' },
    { code: 'KRW', name: '韓圓', flag: '🇰🇷' },
  ];

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/HKD')
      .then(res => res.json())
      .then(data => {
        if (data && data.rates) {
          setRates(data.rates);
        }
      })
      .catch(err => {
        console.error('Fetch rates failed, using defaults', err);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'split_projects'), where('authorizedUsers', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SplitProject[];
      setProjects(data);
      if (activeProject) {
        const updated = data.find(p => p.id === activeProject.id);
        if (updated) setActiveProject(updated);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'split_projects', user);
    });
    return unsubscribe;
  }, [user, activeProject?.id]);

  useEffect(() => {
    if (showScanner) {
      // Small delay to ensure div is in DOM
      const timer = setTimeout(() => {
        const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        scanner.render((result) => {
          setJoinId(result);
          setShowScanner(false);
          scanner.clear();
        }, (error) => {
          // console.log(error);
        });
        return () => {
          scanner.clear().catch(console.error);
        };
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showScanner]);

  const handleCreateProject = async () => {
    if (!user || !newName) return;
    const members = newMembers.filter(m => m.trim() !== '');
    if (members.length < 2) return;

    try {
      await addDoc(collection(db, 'split_projects'), {
        name: newName,
        password: newPassword,
        members,
        items: [],
        createdBy: user.uid,
        authorizedUsers: [user.uid],
        createdAt: serverTimestamp(),
      });
      setShowCreate(false);
      setNewName('');
      setNewPassword('');
      setNewMembers(['', '']);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'split_projects', user);
    }
  };

  const calculateConverted = () => {
    if (!originalAmount || !rates[fromCurrency]) return '';
    const rate = 1 / rates[fromCurrency];
    return (parseFloat(originalAmount) * rate).toFixed(2);
  };

  const applyConversion = () => {
    const converted = calculateConverted();
    console.log('Converted amount:', converted);
    if (converted) {
      setItemAmount(converted);
      // We also keep the original amount so it stays in the form and is saved in the item
      setShowExchange(false);
    } else {
      alert('無法計算，請檢查輸入或網路連接');
    }
  };

  const handleAddItem = async () => {
    if (!activeProject) return;
    
    if (!itemAmount || parseFloat(itemAmount) <= 0) {
      alert('請輸入有效金額');
      return;
    }
    if (!itemPayer) {
      alert('請選擇支付人');
      return;
    }
    if (itemParts.length === 0) {
      alert('請選擇參與成員');
      return;
    }
    
    let updatedItems = [...activeProject.items];
    const newItemBase = {
      desc: itemDesc || '共同開支',
      amount: parseFloat(itemAmount),
      payer: itemPayer,
      participants: itemParts,
      date: itemDate,
      originalAmount: originalAmount !== '' ? parseFloat(originalAmount) : undefined,
      originalCurrency: originalAmount !== '' ? fromCurrency : undefined,
      exchangeRate: originalAmount !== '' ? (1 / rates[fromCurrency]) : undefined,
    };

    if (editingItemId) {
      updatedItems = updatedItems.map(item => 
        item.id === editingItemId ? { ...item, ...newItemBase } : item
      );
    } else {
      updatedItems.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        ...newItemBase
      } as SplitItem);
    }

    try {
      await updateDoc(doc(db, 'split_projects', activeProject.id), {
        items: updatedItems
      });
      setItemDesc('');
      setItemAmount('');
      setItemPayer('');
      setItemParts([]);
      setOriginalAmount('');
      setEditingItemId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'split_projects', user);
    }
  };

  const handleEditItem = (item: SplitItem) => {
    setEditingItemId(item.id);
    setItemDesc(item.desc);
    setItemAmount(item.amount.toString());
    setItemPayer(item.payer);
    setItemParts(item.participants);
    setItemDate(item.date);
    setOriginalAmount(item.originalAmount?.toString() || '');
    setFromCurrency(item.originalCurrency || 'HKD');
    setViewTab('details');
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeProject) return;
    const updatedItems = activeProject.items.filter(i => i.id !== itemId);
    try {
      await updateDoc(doc(db, 'split_projects', activeProject.id), {
        items: updatedItems
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'split_projects', user);
    }
  };

  const calculateBalances = (project: SplitProject) => {
    const balances: Record<string, number> = {};
    project.members.forEach(m => balances[m] = 0);
    project.items.forEach(item => {
      const share = item.amount / item.participants.length;
      balances[item.payer] += item.amount;
      item.participants.forEach(p => balances[p] -= share);
    });
    return balances;
  };

  const calculateSettlement = (balances: Record<string, number>) => {
    const debtors: { n: string, a: number }[] = [];
    const creditors: { n: string, a: number }[] = [];
    Object.entries(balances).forEach(([n, a]) => {
      if (a < -0.01) debtors.push({ n, a: -a });
      else if (a > 0.01) creditors.push({ n, a });
    });

    const res: string[] = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].a, creditors[j].a);
      res.push(`${debtors[i].n} ➡ ${creditors[j].n}: $${pay.toFixed(2)}`);
      debtors[i].a -= pay;
      creditors[j].a -= pay;
      if (debtors[i].a <= 0.01) i++;
      if (creditors[j].a <= 0.01) j++;
    }
    return res;
  };

  const handleJoinProject = async () => {
    if (!user || !joinId) return;
    try {
      const projectRef = doc(db, 'split_projects', joinId);
      const projectSnap = await getDoc(projectRef);
      if (projectSnap.exists()) {
        const data = projectSnap.data();
        if (data.password && data.password !== joinPassword) {
          alert('密碼錯誤！');
          return;
        }
        if (!data.authorizedUsers?.includes(user.uid)) {
          await updateDoc(projectRef, {
            authorizedUsers: arrayUnion(user.uid)
          });
        }
        setShowJoin(false);
        setJoinId('');
        setJoinPassword('');
      } else {
        alert('找不到該計畫！');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'split_projects', user);
    }
  };

  const handleCopyId = () => {
    if (!activeProject) return;
    navigator.clipboard.writeText(activeProject.id);
    alert('計畫 ID 已複製！');
  };

  const handleDeleteProject = async () => {
    if (!activeProject || !user) return;
    if (confirm('確定要刪除整個計畫嗎？此動作無法復原。')) {
      try {
        await deleteDoc(doc(db, 'split_projects', activeProject.id));
        setActiveProject(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'split_projects', user);
      }
    }
  };

  if (activeProject) {
    const balances = calculateBalances(activeProject);
    const settlements = calculateSettlement(balances);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between px-2">
          <button onClick={() => setActiveProject(null)} className="flex items-center text-sm font-black text-emerald-600 uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4 mr-1" />
            返回
          </button>
          <button onClick={handleDeleteProject} className="text-[10px] font-black text-rose-400 uppercase tracking-widest">刪除計畫</button>
        </div>

        {/* Header Card */}
        <div className="bg-emerald-600 rounded-[40px] p-8 text-white shadow-xl shadow-emerald-100 flex flex-col items-center space-y-4">
          <h2 className="text-3xl font-black tracking-tighter">{activeProject.name}</h2>
          <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-[0.2em]">成員: {activeProject.members.join(' • ')}</p>
          <div className="grid grid-cols-2 gap-3 w-full">
            <button 
              onClick={handleCopyId}
              className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 py-3 rounded-2xl text-[10px] font-black transition-all"
            >
              <Copy className="w-4 h-4" /> 複製 ID
            </button>
            <button 
              onClick={() => setShowQR(true)}
              className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 py-3 rounded-2xl text-[10px] font-black transition-all"
            >
              <QrCode className="w-4 h-4" /> QR Code
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="bg-slate-100 p-1 rounded-[24px] flex">
          <button 
            onClick={() => setViewTab('overview')}
            className={cn(
              "flex-1 py-4 rounded-[20px] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all",
              viewTab === 'overview' ? "bg-slate-800 text-white shadow-lg" : "text-slate-400"
            )}
          >
            📊 概覽
          </button>
          <button 
            onClick={() => setViewTab('details')}
            className={cn(
              "flex-1 py-4 rounded-[20px] flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all",
              viewTab === 'details' ? "bg-white text-slate-800 shadow-lg" : "text-slate-400"
            )}
          >
            📅 明細
          </button>
        </div>

        {viewTab === 'overview' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-300 italic text-center">結算建議</h4>
              <div className="space-y-2">
                {settlements.length > 0 ? settlements.map((s, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">💰</div>
                    <p className="text-sm font-bold text-slate-700">{s}</p>
                  </div>
                )) : (
                  <p className="text-center italic text-slate-400 text-sm">所有帳目已平息 ✨</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {activeProject.members.map(m => (
                <div key={m} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex justify-between items-center">
                  <span className="font-bold text-slate-700 text-lg">{m}</span>
                  <span className={cn("text-xl font-black tracking-tight", balances[m] >= 0 ? "text-emerald-500" : "text-rose-500")}>
                    {balances[m] >= 0 ? '+' : ''}HK${balances[m].toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Calendar View */}
            <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm">
              <Calendar
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                items={activeProject.items}
              />
            </div>

            {/* Add Item Form */}
            <div className="bg-slate-50 rounded-[40px] p-8 border border-slate-100 shadow-inner space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic text-center">新增明細</h3>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="項目名稱"
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm text-center"
                />
                
                <div className="flex items-center justify-between text-[10px] font-black text-emerald-500 uppercase tracking-widest px-2">
                  <span>金額 (HKD)</span>
                  <button 
                    onClick={() => setShowExchange(!showExchange)}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1 rounded-full transition-all",
                      showExchange ? "bg-emerald-500 text-white" : "bg-emerald-50 text-emerald-600"
                    )}
                  >
                    <Globe className="w-3 h-3" /> 匯率轉換
                  </button>
                  <span>墊付人</span>
                </div>

                {showExchange && (
                  <div className="p-6 bg-white border-2 border-emerald-100 rounded-3xl space-y-4 animate-in zoom-in-95 duration-200">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        placeholder="外幣金額"
                        value={originalAmount}
                        onChange={(e) => setOriginalAmount(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-center"
                      />
                      <select
                        value={fromCurrency}
                        onChange={(e) => setFromCurrency(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold text-center"
                      >
                        {currencies.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                      </select>
                    </div>
                    {originalAmount && (
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-black text-slate-300 uppercase">估算結果:</span>
                        <span className="text-sm font-black text-emerald-600">≈ HKD {calculateConverted()}</span>
                      </div>
                    )}
                    <button 
                      type="button"
                      onClick={applyConversion}
                      className="w-full py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                    >
                      套用金額
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={itemAmount}
                    onChange={(e) => setItemAmount(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-black text-2xl text-center"
                  />
                  <select
                    value={itemPayer}
                    onChange={(e) => setItemPayer(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm text-center"
                  >
                    <option value="">選擇支付人</option>
                    {activeProject.members.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 block text-center">誰有份參與？</label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {activeProject.members.map(m => (
                      <button
                        key={m}
                        onClick={() => setItemParts(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                          itemParts.includes(m) ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-400 border-slate-200"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 block text-center">日期</label>
                  <input
                    type="date"
                    value={itemDate}
                    onChange={(e) => setItemDate(e.target.value)}
                    className="w-full px-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm text-center"
                  />
                </div>

                <button
                  onClick={handleAddItem}
                  className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
                >
                  {editingItemId ? '保存修改' : '加入明細'}
                </button>
              </div>
            </div>

            {/* History List */}
            <div className="space-y-4 pb-20">
              {activeProject.items.filter(item => {
                const itemDateObj = new Date(item.date);
                return itemDateObj.getFullYear() === currentMonth.getFullYear() && 
                       itemDateObj.getMonth() === currentMonth.getMonth();
              }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((item, idx, arr) => {
                const showDate = idx === 0 || item.date !== arr[idx - 1].date;
                return (
                  <div key={item.id} className="space-y-2">
                    {showDate && (
                      <div className="flex items-center gap-3 px-2">
                        <div className="h-[1px] flex-1 bg-slate-100" />
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">{item.date}</span>
                        <div className="h-[1px] flex-1 bg-slate-100" />
                      </div>
                    )}
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
                      <div className="space-y-1">
                        <p className="font-black text-slate-800">{item.desc}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.payer} 付款 • {item.participants.join(', ')}參與</p>
                        {item.originalAmount && (
                          <div className="flex items-center gap-1 text-[8px] font-black text-emerald-500 uppercase bg-emerald-50 px-2 py-0.5 rounded-full w-fit mt-1">
                            <Globe className="w-2 h-2" />
                            <span>{item.originalCurrency} {item.originalAmount.toFixed(2)} (匯率: {item.exchangeRate?.toFixed(4)})</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-black text-slate-900 tabular-nums">HK${item.amount.toFixed(2)}</p>
                        <div className="flex gap-1">
                          <button onClick={() => handleEditItem(item)} className="p-2 text-slate-300 hover:text-emerald-500 transition-colors"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* QR Code Modal */}
        {showQR && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-[48px] p-10 flex flex-col items-center space-y-6 relative border-4 border-emerald-500 shadow-2xl">
              <button 
                onClick={() => setShowQR(false)}
                className="absolute top-6 right-6 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-black tracking-tighter">分享計畫</h3>
              <div className="p-4 bg-slate-50 rounded-[32px] border border-slate-100 shadow-inner">
                <QRCodeSVG 
                  value={activeProject.id}
                  size={200}
                  level="H"
                  includeMargin={true}
                  className="rounded-xl"
                />
              </div>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">計畫 ID</p>
                <p className="font-mono font-bold text-slate-800 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">{activeProject.id}</p>
              </div>
              <p className="text-[10px] font-bold text-slate-400 text-center leading-relaxed italic opacity-80 uppercase tracking-widest">請對方向開發者提供的「加入計畫」功能中輸入此 ID 即可加入。</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-emerald-600 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <h2 className="text-4xl font-black tracking-tighter mb-2">分帳助手</h2>
        <p className="text-xs font-bold text-emerald-100 opacity-80 italic">多人聚餐、旅遊開支，高效結算。</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="py-6 bg-white border-2 border-emerald-100 rounded-[32px] flex flex-col items-center justify-center gap-3 text-emerald-600 hover:bg-emerald-50 transition-all shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span className="font-black uppercase tracking-widest text-[10px]">新計畫</span>
          </button>
        ) : (
          <button
            onClick={() => setShowCreate(false)}
            className="py-6 bg-slate-50 border-2 border-slate-100 rounded-[32px] flex flex-col items-center justify-center gap-3 text-slate-400 hover:bg-white transition-all shadow-sm"
          >
            <X className="w-5 h-5" />
            <span className="font-black uppercase tracking-widest text-[10px]">取消</span>
          </button>
        )}

        <button
          onClick={() => setShowJoin(!showJoin)}
          className={cn(
            "py-6 rounded-[32px] flex flex-col items-center justify-center gap-3 transition-all shadow-sm border-2",
            showJoin ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
          )}
        >
          <UserPlus className="w-5 h-5" />
          <span className="font-black uppercase tracking-widest text-[10px]">加入計畫</span>
        </button>
      </div>

      {showJoin && (
        <div className="bg-slate-800 rounded-[40px] p-8 text-white shadow-xl space-y-6 animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 italic">加入現有計畫</h3>
            <button 
              onClick={() => setShowScanner(!showScanner)}
              className={cn(
                "p-2 rounded-xl transition-all",
                showScanner ? "bg-rose-500 text-white" : "bg-white/10 text-emerald-400"
              )}
            >
              <Scan className="w-4 h-4" />
            </button>
          </div>

          {showScanner && (
            <div className="overflow-hidden rounded-3xl bg-white p-2">
              <div id="reader" className="w-full"></div>
              <p className="text-[8px] font-bold text-slate-400 text-center py-2 uppercase tracking-widest">請對準計畫 QR Code</p>
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              placeholder="輸入計畫 ID"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              className="w-full px-6 py-4 bg-white/10 border border-white/10 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-center text-white"
            />
            <input
              type="password"
              placeholder="計畫密碼 (如有)"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              className="w-full px-6 py-4 bg-white/10 border border-white/10 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-center text-white"
            />
            <button
              onClick={handleJoinProject}
              className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]"
            >
              立即加入
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-[40px] p-8 border border-emerald-100 shadow-sm space-y-6 animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-600 italic uppercase">設定細節</h3>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="計畫標題 (例如：東京旅行)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:border-emerald-500 transition-all font-black text-center"
            />
            <input
              type="text"
              placeholder="設定密碼 (選填)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm text-center"
            />
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">參與人名單</label>
             {newMembers.map((m, idx) => (
               <div key={idx} className="flex gap-2">
                 <input
                   type="text"
                   value={m}
                   onChange={(e) => {
                     const updated = [...newMembers];
                     updated[idx] = e.target.value;
                     setNewMembers(updated);
                   }}
                   placeholder={`成員 ${idx + 1}`}
                   className="flex-1 px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm text-center"
                 />
                 {newMembers.length > 2 && (
                   <button onClick={() => setNewMembers(prev => prev.filter((_, i) => i !== idx))} className="text-slate-200 hover:text-rose-500 transition-colors">✕</button>
                 )}
               </div>
             ))}
             <button
               onClick={() => setNewMembers(prev => [...prev, ''])}
               className="w-full py-3 border border-dashed border-slate-200 rounded-xl text-slate-300 text-[10px] font-black uppercase tracking-widest hover:border-emerald-200 hover:text-emerald-500 transition-all"
             >
               + 新增成員
             </button>
          </div>

          <button
            onClick={handleCreateProject}
            className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-50 active:scale-95 transition-all"
          >
            完成並建立
          </button>
        </div>
      )}

      {/* Projects List */}
      <div className="space-y-4 pb-20">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 italic">最近參與的計畫</h3>
        {projects.length > 0 ? projects.map(p => (
           <div
            key={p.id}
            onClick={() => setActiveProject(p)}
            className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md cursor-pointer transition-all duration-300 group"
          >
            <div>
              <h4 className="font-black text-slate-900 text-lg group-hover:text-emerald-600 transition-colors">{p.name}</h4>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{p.members.length} 位成員 • {p.items.length} 筆明細</p>
            </div>
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-all">
              <ArrowRight className="w-5 h-5" />
            </div>
          </div>
        )) : (
          <div className="p-12 text-center text-slate-300 space-y-4 italic">
            <p className="text-sm">尚未參與任何計畫</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Calendar Component ---
const Calendar: React.FC<{
  currentMonth: Date;
  setCurrentMonth: (d: Date) => void;
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  items: SplitItem[];
}> = ({ currentMonth, setCurrentMonth, selectedDate, setSelectedDate, items }) => {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDayTotal = (day: Date) => {
    const ds = format(day, 'yyyy-MM-dd');
    const total = items.filter(t => t.date === ds).reduce((acc, t) => acc + t.amount, 0);
    return total;
  };

  return (
    <div className="space-y-6">
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
                isSelected ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100 border-emerald-400" : "hover:bg-slate-50",
                !isCurrentMonth && !isSelected && "opacity-20",
                isToday && !isSelected && "border-emerald-200"
              )}
            >
              <span className="text-[11px] font-black leading-none">{format(day, 'd')}</span>
              {total !== 0 && (
                <span className={cn(
                  "text-[8px] font-black leading-[1] truncate w-[90%] text-center",
                  isSelected ? "text-white" : "text-rose-400"
                )}>
                  {Math.round(total)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
