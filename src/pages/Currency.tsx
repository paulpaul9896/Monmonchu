import React, { useState, useEffect } from 'react';
import { Globe, ArrowRightLeft, RefreshCw, TrendingUp } from 'lucide-react';

export const Currency: React.FC = () => {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [from, setFrom] = useState('HKD');
  const [to, setTo] = useState('JPY');
  const [amount, setAmount] = useState('1000');
  const [loading, setLoading] = useState(true);

  const currencies = [
    { code: 'HKD', name: '港幣', flag: '🇭🇰' },
    { code: 'JPY', name: '日圓', flag: '🇯🇵', mult: 100 },
    { code: 'USD', name: '美元', flag: '🇺🇸' },
    { code: 'TWD', name: '台幣', flag: '🇹🇼', mult: 100 },
    { code: 'EUR', name: '歐元', flag: '🇪🇺' },
    { code: 'CNY', name: '人民幣', flag: '🇨🇳' },
    { code: 'KRW', name: '韓圓', flag: '🇰🇷', mult: 1000 },
  ];

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/HKD')
      .then(res => res.json())
      .then(data => {
        setRates(data.rates);
        setLoading(false);
      });
  }, []);

  const converted = amount && rates[from] && rates[to] 
    ? (parseFloat(amount) / rates[from]) * rates[to] 
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-indigo-600 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
         <h2 className="text-4xl font-black tracking-tighter mb-2">MonMonChu 匯率換算</h2>
         <p className="text-xs font-bold text-indigo-100 opacity-80 italic">旅行必備，即時數據。</p>
      </div>

      <div className="bg-white rounded-[40px] p-8 border border-slate-100 shadow-sm space-y-8">
        <div className="flex flex-col items-center gap-4">
           <div className="w-full relative">
             <input
               type="number"
               value={amount}
               onChange={(e) => setAmount(e.target.value)}
               className="w-full px-8 py-10 bg-slate-50 border-none rounded-[32px] text-5xl font-black text-center outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all tabular-nums"
             />
             <div className="absolute top-4 left-1/2 -translate-x-1/2">
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="bg-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-slate-100 outline-none shadow-sm"
                >
                  {currencies.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
             </div>
           </div>

           <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100 -my-4 z-10">
              <ArrowRightLeft className="w-5 h-5 rotate-90" />
           </div>

           <div className="w-full relative">
             <div className="w-full px-8 py-10 bg-indigo-50 rounded-[32px] text-5xl font-black text-center text-indigo-600 tabular-nums min-h-[140px] flex items-center justify-center">
               {loading ? '...' : `$ ${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
             </div>
             <div className="absolute top-4 left-1/2 -translate-x-1/2">
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="bg-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-slate-100 outline-none shadow-sm"
                >
                  {currencies.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
             </div>
           </div>
        </div>

        <div className="pt-4 space-y-4">
           <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-300 italic text-center">通用參考匯率 (對 HKD)</h4>
           <div className="overflow-hidden rounded-3xl border border-slate-100">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-slate-50">
                  {currencies.filter(c => c.code !== 'HKD').map(c => (
                    <tr key={c.code} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-600">
                        {c.mult || 1} {c.code} ({c.name})
                      </td>
                      <td className="p-4 text-right font-black text-indigo-500">
                        {loading ? '...' : ((c.mult || 1) / (rates[c.code] || 1)).toFixed(3)} HKD
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
        </div>
      </div>
      
      <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
        <RefreshCw className="w-3 h-3" /> Data provider: Open ER API
      </p>
    </div>
  );
};
