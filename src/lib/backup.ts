import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const BACKUP_VERSION = 2;

export interface MonmonBackup {
  version: number;
  exportedAt: string;
  appVersion: string;
  userEmail?: string;
  expenses: Record<string, unknown>[];
  recurring: Record<string, unknown>[];
}

function serializeTimestamp(val: unknown): unknown {
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return val;
}

function serializeDoc(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = serializeTimestamp(v);
  }
  return out;
}

function expenseFingerprint(data: {
  amount: number;
  category: string;
  type: unknown;
  dateStr: string;
  remark?: string;
  foreignAmount?: number | null;
  foreignCurrency?: string | null;
}): string {
  return [
    data.amount,
    data.category,
    data.type,
    data.dateStr,
    data.remark ?? '',
    data.foreignAmount ?? '',
    data.foreignCurrency ?? '',
  ].join('|');
}

function recurringFingerprint(data: {
  name: string;
  amount: number;
  freq: unknown;
  type: unknown;
  date?: string;
  endType?: string;
  endDate?: string;
}): string {
  return [
    data.name,
    data.amount,
    data.freq,
    data.type,
    data.date ?? '',
    data.endType ?? '',
    data.endDate ?? '',
  ].join('|');
}

export async function fetchBackupData(userId: string, userEmail?: string | null, appVersion = '1.1.13'): Promise<MonmonBackup> {
  const [expSnap, recSnap] = await Promise.all([
    getDocs(query(collection(db, 'expenses'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'recurring'), where('userId', '==', userId))),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    userEmail: userEmail || undefined,
    expenses: expSnap.docs.map(d => ({ backupId: d.id, ...serializeDoc(d.data()) })),
    recurring: recSnap.docs.map(d => ({ backupId: d.id, ...serializeDoc(d.data()) })),
  };
}

export function downloadBackupFile(data: MonmonBackup) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `monmonchu-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAndDownloadBackup(userId: string, userEmail?: string | null, appVersion = '1.1.13') {
  const data = await fetchBackupData(userId, userEmail, appVersion);
  downloadBackupFile(data);
}

export function validateBackup(data: unknown): data is MonmonBackup {
  if (!data || typeof data !== 'object') return false;
  const b = data as MonmonBackup;
  return (
    typeof b.version === 'number' &&
    typeof b.exportedAt === 'string' &&
    Array.isArray(b.expenses) &&
    Array.isArray(b.recurring)
  );
}

export function parseBackupFile(file: File): Promise<MonmonBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!validateBackup(parsed)) {
          reject(new Error('備份檔案格式不正確'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('無法讀取 JSON 檔案'));
      }
    };
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.readAsText(file);
  });
}

export interface ImportResult {
  expensesAdded: number;
  expensesReplaced: number;
  recurringAdded: number;
  recurringReplaced: number;
}

export async function importBackupData(userId: string, data: MonmonBackup): Promise<ImportResult> {
  const [expSnap, recSnap] = await Promise.all([
    getDocs(query(collection(db, 'expenses'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'recurring'), where('userId', '==', userId))),
  ]);

  const expenseMap = new Map<string, string>();
  for (const d of expSnap.docs) {
    const raw = d.data();
    if (typeof raw.amount === 'number' && typeof raw.category === 'string' && raw.type && raw.dateStr) {
      expenseMap.set(expenseFingerprint(raw as Parameters<typeof expenseFingerprint>[0]), d.id);
    }
  }

  const recurringMap = new Map<string, string>();
  for (const d of recSnap.docs) {
    const raw = d.data();
    if (typeof raw.name === 'string' && typeof raw.amount === 'number' && raw.freq && raw.type) {
      recurringMap.set(recurringFingerprint(raw as Parameters<typeof recurringFingerprint>[0]), d.id);
    }
  }

  const result: ImportResult = {
    expensesAdded: 0,
    expensesReplaced: 0,
    recurringAdded: 0,
    recurringReplaced: 0,
  };

  for (const raw of data.expenses) {
    const { backupId: _bid, id: _id, createdAt: _ca, updatedAt: _ua, userId: _uid, ...rest } = raw;
    if (typeof rest.amount !== 'number' || typeof rest.category !== 'string' || !rest.type || !rest.dateStr) continue;

    const payload = {
      amount: rest.amount,
      category: rest.category,
      type: rest.type,
      dateStr: rest.dateStr,
      remark: typeof rest.remark === 'string' ? rest.remark : '',
      userId,
      ...(rest.foreignAmount != null ? { foreignAmount: rest.foreignAmount } : {}),
      ...(rest.foreignCurrency ? { foreignCurrency: rest.foreignCurrency } : {}),
      ...(rest.recurringId ? { recurringId: rest.recurringId } : {}),
      ...(rest.isSalaryAuto ? { isSalaryAuto: rest.isSalaryAuto } : {}),
    };

    const fp = expenseFingerprint(payload);
    const existingId = expenseMap.get(fp);
    if (existingId) {
      await updateDoc(doc(db, 'expenses', existingId), { ...payload, updatedAt: serverTimestamp() });
      result.expensesReplaced++;
    } else {
      await addDoc(collection(db, 'expenses'), { ...payload, createdAt: serverTimestamp() });
      expenseMap.set(fp, 'new');
      result.expensesAdded++;
    }
  }

  for (const raw of data.recurring) {
    const { backupId: _bid, id: _id, userId: _uid, ...rest } = raw;
    if (typeof rest.name !== 'string' || typeof rest.amount !== 'number' || !rest.freq || !rest.type) continue;

    const payload = {
      name: rest.name,
      amount: rest.amount,
      freq: rest.freq,
      type: rest.type,
      date: typeof rest.date === 'string' ? rest.date : new Date().toISOString().slice(0, 10),
      userId,
      ...(rest.endType ? { endType: rest.endType } : {}),
      ...(rest.endDate ? { endDate: rest.endDate } : {}),
    };

    const fp = recurringFingerprint(payload);
    const existingId = recurringMap.get(fp);
    if (existingId) {
      await updateDoc(doc(db, 'recurring', existingId), payload);
      result.recurringReplaced++;
    } else {
      await addDoc(collection(db, 'recurring'), payload);
      recurringMap.set(fp, 'new');
      result.recurringAdded++;
    }
  }

  return result;
}
