// 充电服务台账领域模型：订单与设备资料独立于页面维护

/** 订单状态：候位 → 充电中 → 已拔枪待结清 → 已结清；候位单可取消 */
export type OrderStatus = "waiting" | "charging" | "unplugged" | "settled" | "cancelled";

/** 报修状态：已报修（停用）→ 已修复待确认（继续停用）→ 已确认（恢复接单） */
export type RepairStatus = "reported" | "fixed" | "confirmed";

export interface OrderEvent {
  at: string;
  text: string;
}

export interface ChargeOrder {
  id: string;
  plate: string;
  phone: string;
  /** 绑定（候位单为意向）枪号 */
  gunId: string | null;
  /** 绑定（候位单为意向）车位号 */
  spotId: string | null;
  status: OrderStatus;
  /** 候位卡点说明：为什么不能上枪 */
  blockReason: string;
  /** 车主预计回位时间 */
  expectedReturnAt: string;
  /** 结算金额，未结清为 0 */
  amount: number;
  note: string;
  createdAt: string;
  enteredAt: string | null;
  unpluggedAt: string | null;
  settledAt: string | null;
  /** 建单/结算时所在班次，便于交接班追溯 */
  shiftCreated: string;
  shiftSettled: string | null;
  events: OrderEvent[];
}

export interface ChargingGun {
  /** 枪号，与车位一一绑定 */
  id: string;
  name: string;
  powerKw: number;
  spotId: string;
}

export interface ChargingSpot {
  id: string;
  name: string;
}

export interface RepairRecord {
  id: string;
  gunId: string;
  fault: string;
  reporter: string;
  reportedAt: string;
  fixNote: string;
  fixer: string;
  fixedAt: string | null;
  confirmer: string;
  confirmedAt: string | null;
  status: RepairStatus;
}

export interface HandoverCheckItem {
  key: "vehicles" | "orders" | "repairs";
  label: string;
  checked: boolean;
}

export interface HandoverSnapshotItem {
  id: string;
  label: string;
  detail: string;
}

export interface Handover {
  id: string;
  /** 交出班次 */
  shift: string;
  fromName: string;
  toName: string;
  note: string;
  createdAt: string;
  /** 接班人签字确认时间，未确认则责任留在原班 */
  confirmedAt: string | null;
  confirmedByName: string | null;
  checklist: HandoverCheckItem[];
  /** 交接时点快照 */
  vehicles: HandoverSnapshotItem[];
  pendingOrders: HandoverSnapshotItem[];
  pendingRepairs: HandoverSnapshotItem[];
}

export interface LedgerState {
  version: number;
  currentShift: string;
  currentAttendant: string;
  guns: ChargingGun[];
  spots: ChargingSpot[];
  orders: ChargeOrder[];
  repairs: RepairRecord[];
  handovers: Handover[];
}

export const SHIFTS = ["早班", "中班", "晚班"] as const;

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: string }> = {
  waiting: { label: "候位等待", tone: "warn" },
  charging: { label: "充电中", tone: "ok" },
  unplugged: { label: "已拔枪待结清", tone: "accent" },
  settled: { label: "已结清", tone: "muted" },
  cancelled: { label: "已取消", tone: "muted" }
};
