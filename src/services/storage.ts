// 本机保存层：台账整体状态写入 localStorage，重开浏览器可接着处理
import type { LedgerState } from "../types";

const STORAGE_KEY = "dfwlfront-7-charging-ledger";
const STATE_VERSION = 1;

export function loadState(): LedgerState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LedgerState;
    // 版本不一致时回到初始资料，避免旧结构串数据
    if (!parsed || parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: LedgerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const stateVersion = STATE_VERSION;
