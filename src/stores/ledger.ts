// 台账业务层：编排订单与设备资料、占用判定，动作后自动本机保存
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
  ChargeOrder,
  Handover,
  HandoverSnapshotItem,
  LedgerState,
  OrderEvent,
  RepairRecord
} from "../types";
import { SHIFTS } from "../types";
import { loadState, saveState } from "../services/storage";
import { buildSeedState } from "../services/seedData";
import {
  checkGunAvailable,
  findWaitingOrderForGun,
  getActiveOrderForGun,
  getGun,
  getOpenRepairForGun,
  isOnSite,
  isUnsettled
} from "../services/occupancy";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const useLedgerStore = defineStore("charging-ledger", () => {
  const initial = loadState() ?? buildSeedState();

  const currentShift = ref(initial.currentShift);
  const currentAttendant = ref(initial.currentAttendant);
  const guns = ref(initial.guns);
  const spots = ref(initial.spots);
  const orders = ref<ChargeOrder[]>(initial.orders);
  const repairs = ref<RepairRecord[]>(initial.repairs);
  const handovers = ref<Handover[]>(initial.handovers);

  function snapshot(): LedgerState {
    return {
      version: initial.version,
      currentShift: currentShift.value,
      currentAttendant: currentAttendant.value,
      guns: guns.value,
      spots: spots.value,
      orders: orders.value,
      repairs: repairs.value,
      handovers: handovers.value
    };
  }

  function persist() {
    saveState(snapshot());
  }

  function addEvent(order: ChargeOrder, text: string) {
    const event: OrderEvent = { at: new Date().toISOString(), text };
    order.events.push(event);
  }

  // 候位单卡点随占用/停用变化实时刷新
  function refreshWaitingReasons() {
    orders.value
      .filter((order) => order.status === "waiting" && order.gunId)
      .forEach((order) => {
        order.blockReason = checkGunAvailable(snapshot(), order.gunId!).reason;
      });
  }

  function setShift(shift: string) {
    currentShift.value = shift;
    persist();
  }

  function setAttendant(name: string) {
    currentAttendant.value = name;
    persist();
  }

  // ---- 车辆进场：绑定枪号与车位；枪被占用/停用则进候位区并写明卡点 ----
  function vehicleEnter(input: {
    plate: string;
    phone: string;
    gunId: string;
    expectedReturnAt: string;
    note: string;
  }): ActionResult {
    const gun = getGun(snapshot(), input.gunId);
    if (!gun) return { ok: false, message: "未找到所选充电枪。" };
    const state = snapshot();
    const block = checkGunAvailable(state, input.gunId);
    const ts = new Date().toISOString();
    const order: ChargeOrder = {
      id: newId("order"),
      plate: input.plate,
      phone: input.phone,
      gunId: input.gunId,
      spotId: gun.spotId,
      status: block.blocked ? "waiting" : "charging",
      blockReason: block.blocked ? block.reason : "",
      expectedReturnAt: input.expectedReturnAt,
      amount: 0,
      note: input.note,
      createdAt: ts,
      enteredAt: block.blocked ? null : ts,
      unpluggedAt: null,
      settledAt: null,
      shiftCreated: currentShift.value,
      shiftSettled: null,
      events: []
    };
    if (block.blocked) {
      addEvent(order, `车辆进场：${block.reason} 进入候位区等待。`);
      orders.value.unshift(order);
      persist();
      return { ok: true, message: `该枪暂不可用，已在候位区登记卡点：${block.reason}` };
    }
    addEvent(order, `车辆进场，绑定${gun.name} / ${spotName(gun.spotId)}，开始充电。`);
    orders.value.unshift(order);
    persist();
    return { ok: true, message: `已绑定${gun.name}与${spotName(gun.spotId)}，开始充电。` };
  }

  function spotName(spotId: string): string {
    return spots.value.find((spot) => spot.id === spotId)?.name ?? spotId;
  }

  // ---- 候位车辆上枪（枪/车位释放后由候位区转入） ----
  function assignWaitingOrder(orderId: string): ActionResult {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || order.status !== "waiting" || !order.gunId) {
      return { ok: false, message: "候位单状态已变化，请刷新核对。" };
    }
    const block = checkGunAvailable(snapshot(), order.gunId);
    if (block.blocked) {
      order.blockReason = block.reason;
      persist();
      return { ok: false, message: block.reason };
    }
    const ts = new Date().toISOString();
    order.status = "charging";
    order.enteredAt = ts;
    order.blockReason = "";
    addEvent(order, `卡点解除，绑定${gunName(order.gunId)} / ${spotName(order.spotId!)}，开始充电。`);
    persist();
    return { ok: true, message: "候位车辆已上枪开始充电。" };
  }

  function cancelWaitingOrder(orderId: string): ActionResult {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || order.status !== "waiting") return { ok: false, message: "只能取消候位中的车辆。" };
    order.status = "cancelled";
    addEvent(order, "车主离开，取消候位登记。");
    persist();
    return { ok: true, message: "候位登记已取消。" };
  }

  // ---- 确认拔枪：同一枪未确认拔枪并结清前，后车只能候位 ----
  function confirmUnplugged(orderId: string): ActionResult {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || order.status !== "charging") return { ok: false, message: "只有充电中的订单可以确认拔枪。" };
    const ts = new Date().toISOString();
    order.status = "unplugged";
    order.unpluggedAt = ts;
    addEvent(order, "现场确认已拔枪，等待车主结清费用。");
    refreshWaitingReasons();
    persist();
    return { ok: true, message: "已确认拔枪，结清前枪仍保持占用。" };
  }

  // ---- 结清：确认拔枪并结清后枪/车位才释放，候位车可转入 ----
  function settleOrder(orderId: string, amount: number): ActionResult {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order) return { ok: false, message: "未找到订单。" };
    if (order.status !== "unplugged") return { ok: false, message: "请先确认拔枪，再结清费用。" };
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: "请输入正确的结算金额。" };
    const ts = new Date().toISOString();
    order.status = "settled";
    order.amount = amount;
    order.settledAt = ts;
    order.shiftSettled = currentShift.value;
    addEvent(order, `结清 ${amount.toFixed(2)} 元，车辆离场，枪/车位释放。`);
    // 枪释放后卡点说明同步变化
    refreshWaitingReasons();
    persist();

    // 释放后自动提示同枪候位车可转入
    const next = findWaitingOrderForGun(snapshot(), order.gunId!);
    if (next) {
      return { ok: true, message: `结清完成，${next.plate} 在候位区可转入${gunName(order.gunId!)}。` };
    }
    return { ok: true, message: "订单已结清，枪/车位已释放。" };
  }

  function gunName(gunId: string): string {
    return guns.value.find((gun) => gun.id === gunId)?.name ?? gunId;
  }

  // ---- 枪体报修：关联车位立即停用 ----
  function reportRepair(input: { gunId: string; fault: string }): ActionResult {
    const gun = getGun(snapshot(), input.gunId);
    if (!gun) return { ok: false, message: "未找到所选充电枪。" };
    if (getOpenRepairForGun(repairs.value, input.gunId)) {
      return { ok: false, message: "该枪已有未结案报修，不能重复报修。" };
    }
    const record: RepairRecord = {
      id: newId("repair"),
      gunId: input.gunId,
      fault: input.fault,
      reporter: currentAttendant.value || "当班人员",
      reportedAt: new Date().toISOString(),
      fixNote: "",
      fixer: "",
      fixedAt: null,
      confirmer: "",
      confirmedAt: null,
      status: "reported"
    };
    repairs.value.unshift(record);

    // 候位单刷新卡点说明（关联车位立即停用）
    refreshWaitingReasons();
    persist();
    return { ok: true, message: `${gun.name}已报修，${spotName(gun.spotId)}立即停用。` };
  }

  // ---- 修复记录：未确认前不能恢复接单（仅推进到“已修复待确认”） ----
  function fixRepair(repairId: string, fixNote: string): ActionResult {
    const record = repairs.value.find((item) => item.id === repairId);
    if (!record || record.status !== "reported") return { ok: false, message: "只有已报修状态可以登记修复。" };
    record.status = "fixed";
    record.fixNote = fixNote;
    record.fixer = currentAttendant.value || "当班人员";
    record.fixedAt = new Date().toISOString();
    persist();
    return { ok: true, message: "修复已登记，需确认后枪/车位才能恢复接单。" };
  }

  // ---- 确认修复：恢复接单 ----
  function confirmRepair(repairId: string): ActionResult {
    const record = repairs.value.find((item) => item.id === repairId);
    if (!record || record.status !== "fixed") return { ok: false, message: "请先登记修复记录。" };
    record.status = "confirmed";
    record.confirmer = currentAttendant.value || "当班人员";
    record.confirmedAt = new Date().toISOString();
    // 卡点可能已从“报修”变成“前车占用”，统一实时刷新
    refreshWaitingReasons();
    persist();
    const waiting = findWaitingOrderForGun(snapshot(), record.gunId);
    if (waiting) {
      return { ok: true, message: `修复已确认，${gunName(record.gunId)}恢复接单；${waiting.plate} 可从候位区转入。` };
    }
    return { ok: true, message: `修复已确认，${gunName(record.gunId)}与关联车位恢复接单。` };
  }

  // ---- 交接班 ----
  const pendingHandover = computed(() =>
    handovers.value.find((handover) => !handover.confirmedAt) ?? null
  );

  function buildSnapshotItems(): {
    vehicles: HandoverSnapshotItem[];
    pendingOrders: HandoverSnapshotItem[];
    pendingRepairs: HandoverSnapshotItem[];
  } {
    const vehicles = orders.value.filter(isOnSite).map((order) => ({
      id: order.id,
      label: order.plate,
      detail: `${order.status === "waiting" ? "候位区" : `${gunName(order.gunId!)}/${spotName(order.spotId!)}`}，${
        order.status === "waiting" ? order.blockReason : order.status === "unplugged" ? "已拔枪待结清" : "充电中"
      }`
    }));
    const pendingOrders = orders.value.filter(isUnsettled).map((order) => ({
      id: order.id,
      label: order.plate,
      detail: `${order.status === "waiting" ? "候位未上枪" : order.status === "unplugged" ? "已拔枪待结清" : "充电中"}，${
        order.shiftCreated
      }建单`
    }));
    const pendingRepairs = repairs.value
      .filter((repair) => repair.status !== "confirmed")
      .map((repair) => ({
        id: repair.id,
        label: gunName(repair.gunId),
        detail: repair.status === "fixed" ? "已修复待确认，车位仍停用" : `已报修停用：${repair.fault}`
      }));
    return { vehicles, pendingOrders, pendingRepairs };
  }

  function createHandover(toName: string, note: string): ActionResult {
    if (pendingHandover.value) {
      return { ok: false, message: "本班已有一份交接未被接班人确认，责任仍在原班。" };
    }
    const { vehicles, pendingOrders, pendingRepairs } = buildSnapshotItems();
    const handover: Handover = {
      id: newId("handover"),
      shift: currentShift.value,
      fromName: currentAttendant.value || "当班人员",
      toName,
      note,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      confirmedByName: null,
      checklist: [
        { key: "vehicles", label: "逐辆核对在场车辆", checked: false },
        { key: "orders", label: "核对未结订单", checked: false },
        { key: "repairs", label: "核对待修设备", checked: false }
      ],
      vehicles,
      pendingOrders,
      pendingRepairs
    };
    handovers.value.unshift(handover);
    persist();
    return { ok: true, message: "交接单已生成，等待接班人逐项核对并签字确认。" };
  }

  function toggleHandoverItem(handoverId: string, key: string) {
    const handover = handovers.value.find((item) => item.id === handoverId);
    if (!handover || handover.confirmedAt) return;
    const item = handover.checklist.find((entry) => entry.key === key);
    if (item) item.checked = !item.checked;
    persist();
  }

  // ---- 接班人确认：逐项核对 + 签字后责任才转移到新班 ----
  function confirmHandover(handoverId: string, signName: string): ActionResult {
    const handover = handovers.value.find((item) => item.id === handoverId);
    if (!handover) return { ok: false, message: "未找到交接单。" };
    if (handover.confirmedAt) return { ok: false, message: "该交接单已确认。" };
    if (!handover.checklist.every((item) => item.checked)) {
      return { ok: false, message: "请先逐项核对在场车辆、未结订单和待修设备。" };
    }
    if (!signName.trim()) return { ok: false, message: "接班人需签字（填写姓名）后才能确认。" };
    handover.confirmedAt = new Date().toISOString();
    handover.confirmedByName = signName.trim();
    persist();
    // 接班后切到接班人当班：早→中→晚→（次日）早
    const currentIndex = SHIFTS.indexOf(handover.shift as (typeof SHIFTS)[number]);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % SHIFTS.length : 0;
    currentShift.value = SHIFTS[nextIndex];
    currentAttendant.value = signName.trim();
    persist();
    return { ok: true, message: `接班人已确认，责任转入${currentShift.value}。` };
  }

  // ---- 汇总指标 ----
  const onSiteOrders = computed(() => orders.value.filter(isOnSite));
  const waitingOrders = computed(() => orders.value.filter((order) => order.status === "waiting"));
  const unsettledOrders = computed(() => orders.value.filter(isUnsettled));
  const openRepairs = computed(() => repairs.value.filter((repair) => repair.status !== "confirmed"));

  const metrics = computed(() => [
    { label: "在场车辆", value: onSiteOrders.value.length },
    { label: "候位等待", value: waitingOrders.value.length },
    { label: "未结订单", value: unsettledOrders.value.length },
    { label: "待修设备", value: openRepairs.value.length }
  ]);

  function gunStatus(gunId: string) {
    const repair = getOpenRepairForGun(repairs.value, gunId);
    const active = getActiveOrderForGun(orders.value, gunId);
    return { repair, active };
  }

  return {
    // state
    currentShift,
    currentAttendant,
    guns,
    spots,
    orders,
    repairs,
    handovers,
    // computed
    pendingHandover,
    onSiteOrders,
    waitingOrders,
    unsettledOrders,
    openRepairs,
    metrics,
    // actions
    setShift,
    setAttendant,
    vehicleEnter,
    assignWaitingOrder,
    cancelWaitingOrder,
    confirmUnplugged,
    settleOrder,
    reportRepair,
    fixRepair,
    confirmRepair,
    createHandover,
    toggleHandoverItem,
    confirmHandover,
    gunStatus,
    persist
  };
});
