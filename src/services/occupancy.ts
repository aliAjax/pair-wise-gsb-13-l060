// 占用判定层：枪/车位占用与停用规则，纯函数便于核对和测试
import type { ChargeOrder, ChargingGun, LedgerState, RepairRecord } from "../types";

/** 还没结清、仍占着枪的在充订单（含已拔枪待结清，未确认拔枪并结清前枪不释放） */
export function getActiveOrderForGun(orders: ChargeOrder[], gunId: string): ChargeOrder | undefined {
  return orders.find((order) => order.gunId === gunId && (order.status === "charging" || order.status === "unplugged"));
}

/** 未确认修复的报修单（已报修 + 已修复待确认都让关联车位继续停用） */
export function getOpenRepairForGun(repairs: RepairRecord[], gunId: string): RepairRecord | undefined {
  return repairs.find((repair) => repair.gunId === gunId && repair.status !== "confirmed");
}

export function getGun(state: LedgerState, gunId: string | null): ChargingGun | undefined {
  return state.guns.find((gun) => gun.id === gunId);
}

export interface GunBlock {
  blocked: boolean;
  /** 卡点说明，候位单照此写明 */
  reason: string;
}

/** 后车能否上枪：前单未确认拔枪并结清 → 占用；报修未确认 → 停用 */
export function checkGunAvailable(state: LedgerState, gunId: string): GunBlock {
  const repair = getOpenRepairForGun(state.repairs, gunId);
  if (repair) {
    const gun = state.guns.find((item) => item.id === gunId);
    const gunName = gun ? gun.name : gunId;
    if (repair.status === "fixed") {
      return { blocked: true, reason: `${gunName}已修复但修复记录未确认，关联车位继续停用。` };
    }
    return { blocked: true, reason: `${gunName}已报修停用（${repair.fault}），等待修复。` };
  }

  const active = getActiveOrderForGun(state.orders, gunId);
  if (active) {
    const gun = state.guns.find((item) => item.id === gunId);
    const gunName = gun ? gun.name : gunId;
    const what = active.status === "unplugged" ? "前车已拔枪但未结清，枪未释放" : "前一单正在充电，未确认拔枪并结清";
    return { blocked: true, reason: `${gunName}被 ${active.plate} 占用：${what}。` };
  }

  return { blocked: false, reason: "" };
}

/** 候位中且意向枪已空闲可上枪 */
export function findWaitingOrderForGun(state: LedgerState, gunId: string): ChargeOrder | undefined {
  return state.orders.find((order) => order.status === "waiting" && order.gunId === gunId);
}

/** 在场车辆：充电中 + 已拔枪待结清 + 候位等待 */
export function isOnSite(order: ChargeOrder): boolean {
  return order.status === "charging" || order.status === "unplugged" || order.status === "waiting";
}

/** 未结订单：除已结清/已取消外都算未结 */
export function isUnsettled(order: ChargeOrder): boolean {
  return order.status !== "settled" && order.status !== "cancelled";
}
