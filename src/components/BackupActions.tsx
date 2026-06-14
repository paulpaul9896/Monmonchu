import React, { useRef, useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { exportAndDownloadBackup, parseBackupFile, importBackupData } from '../lib/backup';
import { cn } from '../lib/utils';

const APP_VERSION = '1.1.13';

interface BackupActionsProps {
  variant?: 'full' | 'compact';
  showDownload?: boolean;
  showUpload?: boolean;
  className?: string;
}

export const BackupActions: React.FC<BackupActionsProps> = ({
  variant = 'full',
  showDownload = true,
  showUpload = true,
  className,
}) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleDownload = async () => {
    if (!user || downloading) return;
    setDownloading(true);
    try {
      await exportAndDownloadBackup(user.uid, user.email, APP_VERSION);
    } catch {
      alert('下載備份失敗，請稍後再試');
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    if (!confirm('匯入備份會將帳本及定期項目合併至現有帳戶，相同資料會取代舊紀錄。確定繼續？')) return;

    setUploading(true);
    try {
      const data = await parseBackupFile(file);
      const result = await importBackupData(user.uid, data);
      alert(
        `備份匯入完成！\n` +
        `帳本：新增 ${result.expensesAdded} 筆 · 取代 ${result.expensesReplaced} 筆\n` +
        `定期：新增 ${result.recurringAdded} 筆 · 取代 ${result.recurringReplaced} 筆`
      );
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : '匯入備份失敗');
    } finally {
      setUploading(false);
    }
  };

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {showDownload && (
          <button
            onClick={handleDownload}
            disabled={downloading || uploading}
            title="下載備份"
            className="p-2 bg-white/10 hover:bg-white/20 active:scale-90 rounded-[10px] text-white/80 transition-all disabled:opacity-50"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        )}
        {showUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={downloading || uploading}
              title="上傳備份"
              className="p-2 bg-white/10 hover:bg-white/20 active:scale-90 rounded-[10px] text-white/80 transition-all disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleUpload} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-2 gap-3">
        {showDownload && (
          <button
            onClick={handleDownload}
            disabled={downloading || uploading}
            className="flex items-center justify-center gap-2 py-4 bg-[#F2F2F7] hover:bg-slate-200 active:scale-95 rounded-[16px] text-[13px] font-semibold text-slate-700 transition-all disabled:opacity-50"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            下載備份
          </button>
        )}
        {showUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={downloading || uploading}
            className="flex items-center justify-center gap-2 py-4 bg-[#007AFF]/10 hover:bg-[#007AFF]/20 active:scale-95 rounded-[16px] text-[13px] font-semibold text-[#007AFF] transition-all disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            上傳備份
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleUpload} />
      <p className="text-[10px] text-slate-400 text-center leading-relaxed">
        備份包含帳本紀錄及定期項目，匯出為 .json 檔案；相同資料匯入時會取代舊紀錄
      </p>
    </div>
  );
};
