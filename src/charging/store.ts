// 充电台账状态中心：订单流转、设备报修/修复、交接班核对都在这里收口，
// 页面组件只负责展示与派发动作。

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { loadLedger, saveLedger } from "./storage";
import {
  STAGE_LABEL,
  activeOrderOfGun,
  gunAvailability,
  onSiteOrders,
  openRepairs,
  uid,
  unsettledOrders,
} from "./domain";
import type {
  ChargingOrder,
  CheckItem,
  HandoverRecord,
  HandoverSnapshot,
  LedgerData,
  RepairTicket,
  ShiftName,
} from "./types";
import { formatTime, nowText } from "./domain";

export interface VehicleEntryInput {
  plate: string;
  phone: string;
  gunId: string;
  expectedReturn?: string;
  memo?: string;
}

export const useLedgerStore = defineStore("charging-ledger", () => {
  const data = ref<LedgerData>(loadLedger());

  function persist() {
    saveLedger(data.value);
  }

  const dutyShift = computed(() => data.value.dutyShift);
  const guns = computed(() => data.value.guns);
  const orders = computed(() => data.value.orders);
  const repairs = computed(() => data.value.repairs);
  const handovers = computed(() => data.value.handovers);

  const onSite = computed(() => onSiteOrders(data.value.orders));
  const unsettled = computed(() => unsettledOrders(data.value.orders));
  const broken = computed(() => openRepairs(data.value.repairs));

  const availability = computed(() =>
    data.value.guns.map((gun) => gunAvailability(gun, data.value.orders, data.value.repairs))
  );

  /** 接班人未确认时责任仍留在原班 */
  const activeHandover = computed<HandoverRecord | undefined>(() =>
    [...data.value.handovers]
      .filter((handover) => handover.status === "pending" || handover.status === "rejected")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  );

  const pendingHandover = computed(
    () => data.value.handovers.find((handover) => handover.status === "pending")
  );

  /** 责任班次：交接待确认期间归交班班，确认后才切到接班班 */
  const responsibleShift = computed<ShiftName>(
    () => pendingHandover.value?.fromShift ?? data.value.dutyShift
  );

  function setDutyShift(shift: ShiftName) {
    data.value.dutyShift = shift;
    persist();
  }

  // ---------- 车辆进场 / 订单流转 ----------

  /**
   * 车辆进场绑定枪号与车位。
   * 同枪上一单未确认拔枪并结清、或枪体停用维修时，自动进入候位区并写明卡点。
   */
  function vehicleEntry(input: VehicleEntryInput): { order: ChargingOrder; waiting: boolean } {
    const gun = data.value.guns.find((item) => item.id === input.gunId);
    if (!gun) throw new Error("枪号不存在");
    const avail = gunAvailability(gun, data.value.orders, data.value.repairs);
    const base = {
      id: uid("order"),
      plate: input.plate.trim(),
      phone: input.phone.trim(),
      gunId: gun.id,
      stallId: gun.stallId,
      enteredAt: nowText(),
      enteredBy: data.value.dutyShift,
      expectedReturn: input.expectedReturn?.trim() || undefined,
      memo: input.memo?.trim() || undefined,
    };
    const order: ChargingOrder = avail.canCharge
      ? { ...base, stage: "charging" }
      : { ...base, stage: "waiting", blockerNote: avail.reason };
    data.value.orders = [order, ...data.value.orders];
    persist();
    return { order, waiting: !avail.canCharge };
  }

  /** 确认拔枪：仅充电中可操作，枪仍被占用直到结清 */
  function confirmUnplug(orderId: string) {
    const order = data.value.orders.find((item) => item.id === orderId);
    if (!order || order.stage !== "charging") return;
    order.stage = "unplugged";
    order.unpluggedAt = nowText();
    order.unpluggedBy = data.value.dutyShift;
    persist();
  }

  /** 结清离站：必须已确认拔枪；结清后枪位释放，候位车可上桩 */
  function settleOrder(orderId: string, amount: number) {
    const order = data.value.orders.find((item) => item.id === orderId);
    if (!order || order.stage !== "unplugged") return;
    order.stage = "settled";
    order.amount = amount;
    order.settledAt = nowText();
    order.settledBy = data.value.dutyShift;
    persist();
  }

  /** 候位车上桩：枪体正常且无在场未结订单时才允许 */
  function promoteWaiting(orderId: string) {
    const order = data.value.orders.find((item) => item.id === orderId);
    if (!order || order.stage !== "waiting") return;
    const gun = data.value.guns.find((item) => item.id === order.gunId);
    if (!gun) return;
    const avail = gunAvailability(gun, data.value.orders, data.value.repairs);
    if (!avail.canCharge) return;
    order.stage = "charging";
    order.blockerNote = undefined;
    persist();
  }

  // ---------- 设备报修 / 修复 ----------

  /** 枪体报修：关联车位立即停用（由占用判定实时生效，不改设备资料） */
  function reportRepair(gunId: string, fault: string) {
    const gun = data.value.guns.find((item) => item.id === gunId);
    if (!gun) return;
    const ticket: RepairTicket = {
      id: uid("repair"),
      gunId: gun.id,
      stallId: gun.stallId,
      fault: fault.trim(),
      reportedAt: nowText(),
      reportedBy: data.value.dutyShift,
      stage: "待修",
    };
    data.value.repairs = [ticket, ...data.value.repairs];
    persist();
  }

  /** 登记修复：进入修复待确认，期间仍不能恢复接单 */
  function markRepaired(ticketId: string, repairNote: string) {
    const ticket = data.value.repairs.find((item) => item.id === ticketId);
    if (!ticket || ticket.stage !== "待修") return;
    ticket.stage = "修复待确认";
    ticket.repairedAt = nowText();
    ticket.repairedBy = data.value.dutyShift;
    ticket.repairNote = repairNote.trim() || undefined;
    persist();
  }

  /** 确认修复记录：枪位恢复接单 */
  function confirmRepair(ticketId: string) {
    const ticket = data.value.repairs.find((item) => item.id === ticketId);
    if (!ticket || ticket.stage !== "修复待确认") return;
    ticket.confirmedAt = nowText();
    ticket.confirmedBy = data.value.dutyShift;
    persist();
  }

  // ---------- 交接班 ----------

  function buildSnapshot(): HandoverSnapshot {
    const siteList = onSiteOrders(data.value.orders);
    const unsettledList = unsettledOrders(data.value.orders);
    const repairList = openRepairs(data.value.repairs);
    const checks: CheckItem[] = siteList.map((order) => ({
      key: `veh-${order.id}`,
      label: `在场车辆 ${order.plate}`,
      checked: false,
      detail: `${order.gunId} / ${order.stallId} · ${STAGE_LABEL[order.stage]} · 进场 ${formatTime(order.enteredAt)}`,
    }));
    const unpluggedCount = unsettledList.filter((order) => order.stage === "unplugged").length;
    checks.push({
      key: "unsettled",
      label: `未结订单 ${unsettledList.length} 单（含已拔枪待结清 ${unpluggedCount} 单）`,
      checked: false,
      detail: unsettledList.map((order) => `${order.plate}·${STAGE_LABEL[order.stage]}`).join("；") || "无",
    });
    repairList.forEach((ticket) => {
      checks.push({
        key: `dev-${ticket.id}`,
        label: `待修设备 ${ticket.gunId} / ${ticket.stallId}`,
        checked: false,
        detail: `${ticket.stage === "待修" ? "待修停用" : "修复待确认"} · ${ticket.fault}`,
      });
    });
    return {
      onSite: siteList.map((order) => ({
        orderId: order.id,
        plate: order.plate,
        gunId: order.gunId,
        stallId: order.stallId,
        stage: order.stage,
      })),
      unsettled: unsettledList.map((order) => ({
        orderId: order.id,
        plate: order.plate,
        stage: order.stage,
      })),
      broken: repairList.map((ticket) => ({
        ticketId: ticket.id,
        gunId: ticket.gunId,
        stallId: ticket.stallId,
        fault: ticket.fault,
        stage: ticket.stage,
      })),
      checks,
    };
  }

  /** 发起交接班：冻结在场车辆、未结订单、待修设备清单，进入待接班人确认 */
  function createHandover(fromShift: ShiftName, toShift: ShiftName, note: string): HandoverRecord {
    const record: HandoverRecord = {
      id: uid("handover"),
      fromShift,
      toShift,
      createdAt: nowText(),
      submittedAt: nowText(),
      status: "pending",
      note: note.trim(),
      snapshot: buildSnapshot(),
    };
    data.value.handovers = [record, ...data.value.handovers];
    persist();
    return record;
  }

  /** 接班人逐项核对勾选 */
  function toggleHandoverCheck(handoverId: string, key: string) {
    const handover = data.value.handovers.find((item) => item.id === handoverId);
    if (!handover || handover.status !== "pending") return;
    const check = handover.snapshot.checks.find((item) => item.key === key);
    if (check) check.checked = !check.checked;
    persist();
  }

  /** 接班人确认：必须逐项核对完，责任与值班班次才移交 */
  function confirmHandover(handoverId: string) {
    const handover = data.value.handovers.find((item) => item.id === handoverId);
    if (!handover || handover.status !== "pending") return;
    if (!handover.snapshot.checks.every((check) => check.checked)) return;
    handover.status = "confirmed";
    handover.confirmedAt = nowText();
    data.value.dutyShift = handover.toShift;
    persist();
  }

  /** 接班人驳回：责任继续留在原班，原班处理后重新发起 */
  function rejectHandover(handoverId: string, reason: string) {
    const handover = data.value.handovers.find((item) => item.id === handoverId);
    if (!handover || handover.status !== "pending") return;
    handover.status = "rejected";
    handover.rejectReason = reason.trim() || "现场情况与交接单不符";
    persist();
  }

  return {
    // state
    data,
    // getters
    dutyShift,
    guns,
    orders,
    repairs,
    handovers,
    onSite,
    unsettled,
    broken,
    availability,
    activeHandover,
    pendingHandover,
    responsibleShift,
    // actions
    setDutyShift,
    vehicleEntry,
    confirmUnplug,
    settleOrder,
    promoteWaiting,
    reportRepair,
    markRepaired,
    confirmRepair,
    createHandover,
    toggleHandoverCheck,
    confirmHandover,
    rejectHandover,
  };
});
