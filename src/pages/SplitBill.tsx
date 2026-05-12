import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { handleFirestoreError, OperationType, cn } from '../lib/utils';
import { Users, Plus, Trash2, ArrowRight, CheckCircle2, UserPlus, Info, Pencil } from 'lucide-react';

interface SplitItem {
  id: string;
  desc: string;
  amount: number;
  payer: string;
  participants: string[];
  date: string;
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
  const [newMembers, setNewMembers] = useState(['', '']);

  // Add Item form state
  const [itemDesc, setItemDesc] = useState('');
  const [itemAmount, setItemAmount] = useState('');
  const [itemPayer, setItemPayer] = useState('');
  const [itemParts, setItemParts] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'split_projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SplitProject[];
      setProjects(data);
      if (activeProject) {
        const updated = data.find(p => p.id === activeProject.id);
        if (updated) setActiveProject(updated);
      }
    });
    return unsubscribe;
  }, [user, activeProject?.id]);

  const handleCreateProject = async () => {
    if (!user || !newName) return;
    const members = newMembers.filter(m => m.trim() !== '');
    if (members.length < 2) return;

    try {
      await addDoc(collection(db, 'split_projects'), {
        name: newName,
        members,
        items: [],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setShowCreate(false);
      setNewName('');
      setNewMembers(['', '']);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'split_projects', user);
    }
  };

  const handleAddItem = async () => {
    if (!activeProject || !itemAmount || !itemPayer || itemParts.length === 0) return;
    
    let updatedItems = [...activeProject.items];

    if (editingItemId) {
      updatedItems = updatedItems.map(item => 
        item.id === editingItemId ? {
          ...item,
          desc: itemDesc || '共同開支',
          amount: parseFloat(itemAmount),
          payer: itemPayer,
          participants: itemParts,
        } : item
      );
    } else {
      updatedItems.push({
        id: Date.now().toString(),
        desc: itemDesc || '共同開支',
        amount: parseFloat(itemAmount),
        payer: itemPayer,
        participants: itemParts,
        date: new Date().toLocaleDateString(),
      });
    }

    try {
      await updateDoc(doc(db, 'split_projects', activeProject.id), {
        items: updatedItems
      });
      setItemDesc('');
      setItemAmount('');
      setItemPayer('');
      setItemParts([]);
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

  if (activeProject) {
    const balances = calculateBalances(activeProject);
    const settlements = calculateSettlement(balances);

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <button onClick={() => setActiveProject(null)} className="text-sm font-black text-emerald-600 uppercase tracking-widest">← 返回</button>
          <h2 className="text-xl font-black text-slate-900 tracking-tighter">{activeProject.name}</h2>
          <div className="w-10" />
        </div>

        {/* Overview */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-emerald-600 rounded-[40px] p-8 text-white shadow-xl shadow-emerald-100">
             <h4 className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-4 italic text-center">結算建議</h4>
             <div className="space-y-2">
               {settlements.length > 0 ? settlements.map((s, idx) => (
                 <div key={idx} className="bg-white/10 p-4 rounded-2xl flex items-center gap-3">
                   <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">💰</div>
                   <p className="text-sm font-bold">{s}</p>
                 </div>
               )) : (
                 <p className="text-center italic opacity-60 text-sm">所有帳目已平息 ✨</p>
               )}
             </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-4">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-300 italic text-center">個人餘額</h4>
             {activeProject.members.map(m => (
               <div key={m} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                 <span className="font-bold text-slate-700">{m}</span>
                 <span className={cn("font-black tracking-tight", balances[m] >= 0 ? "text-emerald-500" : "text-rose-500")}>
                   {balances[m] >= 0 ? '+' : ''}${balances[m].toFixed(2)}
                 </span>
               </div>
             ))}
          </div>
        </div>

        {/* Add Item Form */}
        <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
              {editingItemId ? '修改帳目' : '記一筆帳'}
            </h3>
            {editingItemId && (
              <button onClick={() => {
                setEditingItemId(null);
                setItemDesc('');
                setItemAmount('');
                setItemPayer('');
                setItemParts([]);
              }} className="text-[10px] font-bold text-slate-400 hover:text-slate-900">
                取消
              </button>
            )}
          </div>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="項目名稱"
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm text-center"
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                type="number"
                placeholder="金額 $"
                value={itemAmount}
                onChange={(e) => setItemAmount(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-black text-lg text-center"
              />
              <select
                value={itemPayer}
                onChange={(e) => setItemPayer(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-emerald-500 transition-all font-bold text-sm"
              >
                <option value="">由誰支付？</option>
                {activeProject.members.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">誰有份？ (多人選擇)</label>
              <div className="flex flex-wrap gap-2 justify-center">
                {activeProject.members.map(m => (
                  <button
                    key={m}
                    onClick={() => setItemParts(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      itemParts.includes(m) ? "bg-emerald-500 text-white shadow-md shadow-emerald-100" : "bg-slate-100 text-slate-400"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAddItem}
              className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-50 active:scale-95 transition-all"
            >
              {editingItemId ? '保存更改' : '確認入帳'}
            </button>
          </div>
        </div>

        {/* History */}
        <div className="space-y-4 pb-12">
           <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">消費歷史</h3>
           {activeProject.items.slice().reverse().map(item => (
             <div key={item.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
               <div className="space-y-1">
                 <p className="font-black text-slate-800">{item.desc}</p>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">{item.payer} 已付 • {item.participants.length} 人分開</p>
               </div>
               <div className="flex items-center gap-4">
                 <p className="font-black text-slate-900 tabular-nums">${item.amount.toFixed(2)}</p>
                 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                   <button
                     onClick={() => handleEditItem(item)}
                     className="w-8 h-8 bg-slate-50 text-slate-300 hover:bg-emerald-50 hover:text-emerald-500 rounded-lg flex items-center justify-center"
                   >
                     <Pencil className="w-3 h-3" />
                   </button>
                   <button
                     onClick={() => handleDeleteItem(item.id)}
                     className="w-8 h-8 bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg flex items-center justify-center"
                   >
                     <Trash2 className="w-3 h-3" />
                   </button>
                 </div>
               </div>
             </div>
           ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-emerald-600 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <h2 className="text-4xl font-black tracking-tighter mb-2">分帳助手</h2>
        <p className="text-xs font-bold text-emerald-100 opacity-80">多人聚餐、旅遊開支，一鍵搞定。</p>
      </div>

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-6 bg-white border-2 border-dashed border-emerald-200 rounded-[32px] flex items-center justify-center gap-3 text-emerald-600 hover:bg-emerald-50 transition-all group"
        >
          <div className="p-2 bg-emerald-100 rounded-xl group-hover:scale-110 transition-transform">
            <UserPlus className="w-5 h-5" />
          </div>
          <span className="font-black uppercase tracking-widest text-xs">建立新分帳計畫</span>
        </button>
      ) : (
        <div className="bg-white rounded-[40px] p-8 border border-emerald-100 shadow-sm space-y-6 animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-600 italic">計畫設定</h3>
            <button onClick={() => setShowCreate(false)} className="text-slate-300 hover:text-rose-500 transition-colors">✕</button>
          </div>
          
          <input
            type="text"
            placeholder="項目標題 (例如：週末露營)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:border-emerald-500 transition-all font-black text-center"
          />

          <div className="space-y-3">
             <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">參與成員</label>
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
            className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all"
          >
            立即建立
          </button>
        </div>
      )}

      {/* Projects List */}
      <div className="space-y-4 pb-20">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 italic">進行中的計畫</h3>
        {projects.map(p => (
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
        ))}
      </div>
    </div>
  );
};
