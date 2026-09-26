// 充电服务台账：领域类型
// 订单与设备资料各自独立成模型，占用/卡点等派生判定不放回原始数据。

export type ShiftName = "早班" | "中班" | "晚班";
export const SHIFT_NAMES: readonly ShiftName[] = ["早班", "中班", "晚班"];

/** 枪体运行状态由最新一张维修工单决定 */
export type GunState = "正常" | "待修" | "修复待确认";
export type GunStatus = GunState | "占用";

export interface ChargingGun {
  id: string; // 枪号，如 G01
  powerKw: number;
  stallId: string; // 关联车位号，如 C01
}

export type RepairStage = "待修" | "修复待确认";

export interface RepairTicket {
  id: string;
  gunId: string;
  stallId: string; // 报修瞬间冻结关联车位
  fault: string;
  reportedAt: string;
  reportedBy: ShiftName;
  repairedAt?: string;
  repairedBy?: ShiftName;
  repairNote?: string;
  confirmedAt?: string;
  confirmedBy?: ShiftName;
  stage: RepairStage;
}

/**
 * 订单阶段：
 * charging 充电中（在场、未结）
 * unplugged 已拔枪待结清（在场、未结，枪体未释放）
 * waiting 候位中（后车等待同枪）
 * settled 已结清离站（历史）
 */
export type OrderStage = "charging" | "unplugged" | "waiting" | "settled";

export interface ChargingOrder {
  id: string;
  plate: string;
  phone: string;
  gunId: string;
  stallId: string;
  /** waiting 订单写明卡点（前单未拔枪结清 / 枪体故障等） */
  blockerNote?: string;
  enteredAt: string;
  enteredBy: ShiftName;
  expectedReturn?: string;
  unpluggedAt?: string;
  unpluggedBy?: ShiftName;
  settledAt?: string;
  settledBy?: ShiftName;
  amount?: number;
  stage: OrderStage;
  memo?: string;
}

export interface CheckItem {
  key: string;
  label: string;
  checked: boolean;
  detail: string;
}

export type HandoverStatus = "draft" | "pending" | "confirmed" | "rejected";

/** 建单时冻结的核对快照，交接确认后仍可追溯当时清单 */
export interface HandoverSnapshot {
  onSite: { orderId: string; plate: string; gunId: string; stallId: string; stage: OrderStage }[];
  unsettled: { orderId: string; plate: string; stage: OrderStage }[];
  broken: { ticketId: string; gunId: string; stallId: string; fault: string; stage: RepairStage }[];
  checks: CheckItem[];
}

export interface HandoverRecord {
  id: string;
  fromShift: ShiftName;
  toShift: ShiftName;
  createdAt: string;
  submittedAt?: string;
  confirmedAt?: string;
  status: HandoverStatus;
  note: string;
  rejectReason?: string;
  snapshot: HandoverSnapshot;
}

export interface LedgerData {
  guns: ChargingGun[];
  orders: ChargingOrder[];
  repairs: RepairTicket[];
  handovers: HandoverRecord[];
  dutyShift: ShiftName;
}
