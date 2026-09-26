// 充电服务台账：领域规则
// 全部为纯函数：占用判定、卡点、可用枪位都从订单/设备资料实时派生，不回写资料。

import type {
  ChargingGun,
  ChargingOrder,
  HandoverRecord,
  OrderStage,
  RepairStage,
  RepairTicket,
} from "./types";

export const STORAGE_KEY = "dfwlfront-7-charging-ledger";

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function nowText(): string {
  return new Date().toISOString();
}

export function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 枪的最新维修工单（无则枪体本身正常） */
export function latestRepair(gunId: string, repairs: RepairTicket[]): RepairTicket | undefined {
  return repairs
    .filter((ticket) => ticket.gunId === gunId && !ticket.confirmedAt)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0];
}

/** 枪体状态：待修 / 修复待确认 / 正常（不含占用语义） */
export function gunHardwareState(gun: ChargingGun, repairs: RepairTicket[]): RepairStage | "正常" {
  return latestRepair(gun.id, repairs)?.stage ?? "正常";
}

/**
 * 占用判定：枪上存在未确认拔枪并结清的在场订单（充电中 / 已拔枪待结清）即占用。
 * 候位中订单不占枪，已结清订单释放枪。
 */
export function activeOrderOfGun(gunId: string, orders: ChargingOrder[]): ChargingOrder | undefined {
  const occupiedStages: OrderStage[] = ["charging", "unplugged"];
  return orders.find((order) => order.gunId === gunId && occupiedStages.includes(order.stage));
}

/** 同枪候位队列，按进场时间先后 */
export function waitingQueueOfGun(gunId: string, orders: ChargingOrder[]): ChargingOrder[] {
  return orders
    .filter((order) => order.gunId === gunId && order.stage === "waiting")
    .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
}

export type GunAvailability = {
  gun: ChargingGun;
  hardware: RepairStage | "正常";
  active?: ChargingOrder;
  waiting: ChargingOrder[];
  canCharge: boolean;
  reason: string;
};

/** 页面进场选枪用：综合硬件状态与占用情况 */
export function gunAvailability(gun: ChargingGun, orders: ChargingOrder[], repairs: RepairTicket[]): GunAvailability {
  const hardware = gunHardwareState(gun, repairs);
  const active = activeOrderOfGun(gun.id, orders);
  const waiting = waitingQueueOfGun(gun.id, orders);
  let canCharge = true;
  let reason = "可接单";
  if (hardware === "待修") {
    canCharge = false;
    reason = "枪体报修，关联车位已停用";
  } else if (hardware === "修复待确认") {
    canCharge = false;
    reason = "修复记录待确认，暂不能恢复接单";
  } else if (active) {
    canCharge = false;
    reason = `前车 ${active.plate} 未拔枪结清`;
  }
  return { gun, hardware, active, waiting, canCharge, reason };
}

/** 候位车辆的卡点说明 */
export function blockerOf(order: ChargingOrder, orders: ChargingOrder[], repairs: RepairTicket[]): string {
  const active = activeOrderOfGun(order.gunId, orders);
  const hardware = gunHardwareState({ id: order.gunId } as ChargingGun, repairs);
  if (hardware === "待修") return "枪体故障停用，等待修复";
  if (hardware === "修复待确认") return "修复待确认，等待复核恢复";
  if (active) return `等待前车 ${active.plate} 拔枪并结清`;
  return order.blockerNote || "等待安排上桩";
}

/** 在场车辆（充电中、已拔枪待结清、候位中） */
export function onSiteOrders(orders: ChargingOrder[]): ChargingOrder[] {
  return orders.filter((order) => order.stage !== "settled");
}

/** 未结订单（拔枪未付也算未结，枪不释放） */
export function unsettledOrders(orders: ChargingOrder[]): ChargingOrder[] {
  return orders.filter((order) => order.stage !== "settled");
}

/** 待修设备（含修复待确认，均未恢复接单） */
export function openRepairs(repairs: RepairTicket[]): RepairTicket[] {
  return repairs.filter((ticket) => !ticket.confirmedAt);
}

/**
 * 交接责任：接班人未确认时，最近一张本班发起、处于待确认/被驳回的交接单仍由原班担责。
 */
export function pendingHandover(handovers: HandoverRecord[]): HandoverRecord | undefined {
  return [...handovers]
    .filter((handover) => handover.status === "pending" || handover.status === "rejected")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export const STAGE_LABEL: Record<OrderStage, string> = {
  charging: "充电中",
  unplugged: "已拔枪待结清",
  waiting: "候位中",
  settled: "已结清离站",
};

export const REPAIR_STAGE_LABEL: Record<RepairStage, string> = {
  待修: "待修",
  修复待确认: "修复待确认",
};
