import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface CurrencyInfo {
  code: string;
  name: string;
  flag: string;
  symbol: string;
}

const CURRENCIES: CurrencyInfo[] = [
  { code: 'HKD', name: '港幣',   flag: '🇭🇰', symbol: 'HK$' },
  { code: 'JPY', name: '日圓',   flag: '🇯🇵', symbol: '¥'   },
  { code: 'USD', name: '美元',   flag: '🇺🇸', symbol: '$'   },
  { code: 'EUR', name: '歐元',   flag: '🇪🇺', symbol: '€'   },
  { code: 'CNY', name: '人民幣', flag: '🇨🇳', symbol: '¥'   },
  { code: 'TWD', name: '台幣',   flag: '🇹🇼', symbol: 'NT$' },
  { code: 'KRW', name: '韓圓',   flag: '🇰🇷', symbol: '₩'   },
  { code: 'GBP', name: '英鎊',   flag: '🇬🇧', symbol: '£'   },
  { code: 'SGD', name: '新加坡幣', flag: '🇸🇬', symbol: 'S$' },
  { code: 'AUD', name: '澳元',   flag: '🇦🇺', symbol: 'A$'  },
  { code: 'MYR', name: '馬來西亞令吉', flag: '🇲🇾', symbol: 'RM' },
  { code: 'THB', name: '泰銖',   flag: '🇹🇭', symbol: '฿'   },
];

// 格式化換算結果數字
const fmtResult = (n: number): string => {
  if (n >= 100_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1_000)   return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1)       return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
};

export const Currency: React.FC = () => {
  const [rates, setRates]         = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 基礎貨幣（用戶可點任何一行切換）
  const [baseCurrency, setBaseCurrency] = useState('HKD');
  const [baseAmount, setBaseAmount]     = useState('1000');
  const [showPicker, setShowPicker]     = useState(false);

  // ── 拉匯率（以 HKD 為基準）──
  const fetchRates = useCallback(() => {
    setLoading(true);
    fetch('https://open.er-api.com/v6/latest/HKD')
      .then(r => r.json())
      .then(d => {
        if (d?.rates) { setRates(d.rates); setLastUpdated(new Date()); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  // 計算任意貨幣 → HKD → 目標貨幣
  const convert = (targetCode: string): number => {
    if (!rates[baseCurrency] || !rates[targetCode]) return 0;
    const amtNum = parseFloat(baseAmount) || 0;
    // 先轉成 HKD，再轉目標
    const inHKD = amtNum / rates[baseCurrency];
    return inHKD * rates[targetCode];
  };

  // 點擊某行貨幣 → 設為基礎貨幣，保留當前換算值
  const handleSelectBase = (code: string) => {
    if (code === baseCurrency) return;
    const converted = convert(code);
    setBaseAmount(fmtResult(converted).replace(/,/g, ''));
    setBaseCurrency(code);
  };

  const baseInfo = CURRENCIES.find(c => c.code === baseCurrency) ?? CURRENCIES[0];
  const baseAmtNum = parseFloat(baseAmount) || 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Hero 輸入卡片（參考用戶截圖 Image 3 樣式）── */}
      <div className="bg-white rounded-[24px] shadow-sm border border-black/[0.05] overflow-hidden">

        {/* 基礎貨幣輸入區 */}
        <div className="p-5 pb-3">
          {/* 貨幣選擇器按鈕 */}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-2 mb-3 group"
          >
            <span className="text-xl">{baseInfo.flag}</span>
            <span className="text-[15px] font-bold text-slate-800">{baseInfo.code}</span>
            <span className="text-[13px] font-medium text-slate-400">{baseInfo.name}</span>
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showPicker && "rotate-180")} />
          </button>

          {/* 大字金額輸入 */}
          <input
            type="number"
            inputMode="decimal"
            value={baseAmount}
            onChange={e => setBaseAmount(e.target.value)}
            className="w-full text-[2.8rem] font-black tabular-nums text-slate-900 bg-transparent outline-none leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          />
        </div>

        {/* 貨幣選擇下拉（Picker）*/}
        {showPicker && (
          <div className="border-t border-slate-100 px-3 py-2 max-h-52 overflow-y-auto">
            {CURRENCIES.map(c => (
              <button
                key={c.code}
                onClick={() => { handleSelectBase(c.code); setShowPicker(false); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] transition-all text-left",
                  baseCurrency === c.code ? "bg-[#007AFF]/10 text-[#007AFF]" : "hover:bg-slate-50 text-slate-700"
                )}
              >
                <span className="text-lg">{c.flag}</span>
                <span className="font-semibold text-[13px]">{c.code}</span>
                <span className="text-[12px] text-slate-400">{c.name}</span>
                {baseCurrency === c.code && <span className="ml-auto text-[11px] font-bold text-[#007AFF]">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 多貨幣換算列表（XE 風格）── */}
      <div className="bg-white rounded-[24px] shadow-sm border border-black/[0.05] overflow-hidden">
        <div className="divide-y divide-slate-50">
          {CURRENCIES.filter(c => c.code !== baseCurrency).map(c => {
            const result = convert(c.code);
            // 顯示每 1 單位基礎貨幣 = X 目標貨幣（小字參考）
            const unitRate = rates[baseCurrency] && rates[c.code]
              ? rates[c.code] / rates[baseCurrency]
              : 0;

            return (
              <button
                key={c.code}
                onClick={() => handleSelectBase(c.code)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
              >
                {/* 國旗 */}
                <span className="text-2xl flex-shrink-0">{c.flag}</span>

                {/* 貨幣名稱 */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] text-slate-800">{c.code}</p>
                  <p className="text-[11px] text-slate-400">
                    1 {baseCurrency} = {unitRate > 0 ? fmtResult(unitRate) : '—'} {c.code}
                  </p>
                </div>

                {/* 換算結果（大字）*/}
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-[18px] tabular-nums text-slate-900"
                    style={{ letterSpacing: '-0.01em' }}>
                    {loading ? '...' : fmtResult(result)}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-400">{c.symbol}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 底部：更新時間 + 重新整理 ── */}
      <div className="flex items-center justify-between px-2 pb-24">
        <p className="text-[11px] text-slate-400">
          {lastUpdated ? `匯率更新: ${lastUpdated.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}` : '拉取中...'}
        </p>
        <button
          onClick={fetchRates}
          className={cn("flex items-center gap-1.5 text-[11px] font-semibold text-[#007AFF] active:opacity-60 transition-all",
            loading && "opacity-50")}
          disabled={loading}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          重新整理
        </button>
      </div>
    </div>
  );
};
