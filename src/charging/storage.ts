// 本机保存：订单、设备、交接资料统一序列化到 localStorage，与页面渲染分开维护。
// 首次打开写入种子台账；之后重开页面自动恢复，可接着处理未结订单与待修设备。

import type { LedgerData } from "./types";
import { STORAGE_KEY, nowText } from "./domain";

export function seedData(): LedgerData {
  const base = Date.parse("2026-09-26T20:10:00+08:00");
  const iso = (offsetMin: number) => new Date(base + offsetMin * 60000).toISOString();
  return {
    dutyShift: "晚班",
    guns: [
      { id: "G01", powerKw: 120, stallId: "C01" },
      { id: "G02", powerKw: 120, stallId: "C02" },
      { id: "G03", powerKw: 60, stallId: "C03" },
      { id: "G04", powerKw: 60, stallId: "C04" },
    ],
    orders: [
      {
        id: "seed-order-1",
        plate: "沪A·D8219",
        phone: "138****2104",
        gunId: "G01",
        stallId: "C01",
        enteredAt: iso(-95),
        enteredBy: "中班",
        expectedReturn: "21:40 左右回来",
        stage: "charging",
        memo: "车主去隔壁吃饭",
      },
      {
        id: "seed-order-2",
        plate: "沪B·7F036",
        phone: "139****8851",
        gunId: "G01",
        stallId: "C01",
        enteredAt: iso(-30),
        enteredBy: "晚班",
        blockerNote: "前单未拔枪结清",
        stage: "waiting",
        memo: "已告知候位，停在候位区",
      },
      {
        id: "seed-order-3",
        plate: "沪C·K2280",
        phone: "137****6620",
        gunId: "G03",
        stallId: "C03",
        enteredAt: iso(-150),
        enteredBy: "中班",
        unpluggedAt: iso(-12),
        unpluggedBy: "晚班",
        stage: "unplugged",
        memo: "已拔枪，等车主回来付款",
      },
    ],
    repairs: [
      {
        id: "seed-repair-1",
        gunId: "G04",
        stallId: "C04",
        fault: "扫码后无输出，屏幕报 E12",
        reportedAt: iso(-200),
        reportedBy: "中班",
        stage: "待修",
      },
    ],
    handovers: [],
  };
}

export function loadLedger(): LedgerData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = seedData();
    saveLedger(seed);
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LedgerData>;
    return {
      guns: parsed.guns ?? [],
      orders: parsed.orders ?? [],
      repairs: parsed.repairs ?? [],
      handovers: parsed.handovers ?? [],
      dutyShift: parsed.dutyShift ?? "晚班",
    };
  } catch {
    // 本机数据损坏时回退种子，避免页面整体不可用
    const seed = seedData();
    saveLedger(seed);
    return seed;
  }
}

export function saveLedger(data: LedgerData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export { nowText };
