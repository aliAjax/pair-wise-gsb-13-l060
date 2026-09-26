// 订单与设备资料层：枪/车位绑定关系、在办单据等初始资料
import type { ChargeOrder, ChargingGun, ChargingSpot, LedgerState, RepairRecord } from "../types";
import { stateVersion } from "./storage";

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const seedGuns: ChargingGun[] = [
  { id: "G1", name: "1号枪", powerKw: 120, spotId: "A1" },
  { id: "G2", name: "2号枪", powerKw: 120, spotId: "A2" },
  { id: "G3", name: "3号枪", powerKw: 60, spotId: "B1" },
  { id: "G4", name: "4号枪", powerKw: 60, spotId: "B2" }
];

const seedSpots: ChargingSpot[] = [
  { id: "A1", name: "A1车位" },
  { id: "A2", name: "A2车位" },
  { id: "B1", name: "B1车位" },
  { id: "B2", name: "B2车位" }
];

const seedOrders: ChargeOrder[] = [
  {
    id: "seed-order-1",
    plate: "京A·D8219",
    phone: "138****2210",
    gunId: "G1",
    spotId: "A1",
    status: "charging",
    blockReason: "",
    expectedReturnAt: iso(40 * MINUTE),
    amount: 0,
    note: "车主去站里便利店，预计很快回来。",
    createdAt: iso(-35 * MINUTE),
    enteredAt: iso(-35 * MINUTE),
    unpluggedAt: null,
    settledAt: null,
    shiftCreated: "晚班",
    shiftSettled: null,
    events: [
      { at: iso(-35 * MINUTE), text: "车辆进场，绑定1号枪 / A1车位，开始充电。" }
    ]
  },
  {
    id: "seed-order-2",
    plate: "京B·F5532",
    phone: "139****8841",
    gunId: "G2",
    spotId: "A2",
    status: "unplugged",
    blockReason: "",
    expectedReturnAt: iso(-10 * MINUTE),
    amount: 0,
    note: "已电话催结，车主说在开发票。",
    createdAt: iso(-2 * HOUR),
    enteredAt: iso(-2 * HOUR),
    unpluggedAt: iso(-18 * MINUTE),
    settledAt: null,
    shiftCreated: "中班",
    shiftSettled: null,
    events: [
      { at: iso(-2 * HOUR), text: "车辆进场，绑定2号枪 / A2车位，开始充电。" },
      { at: iso(-18 * MINUTE), text: "确认已拔枪，等待车主结清费用。" }
    ]
  },
  {
    id: "seed-order-3",
    plate: "冀R·K7086",
    phone: "137****5566",
    gunId: "G4",
    spotId: "B2",
    status: "waiting",
    blockReason: "4号枪已报修停用，等待修复确认。",
    expectedReturnAt: iso(90 * MINUTE),
    amount: 0,
    note: "小货车充电，60kW枪即可，先在候位区等着。",
    createdAt: iso(-12 * MINUTE),
    enteredAt: null,
    unpluggedAt: null,
    settledAt: null,
    shiftCreated: "晚班",
    shiftSettled: null,
    events: [
      { at: iso(-12 * MINUTE), text: "车辆进场：4号枪报修停用，进入候位区。" }
    ]
  },
  {
    id: "seed-order-4",
    plate: "津C·T2045",
    phone: "135****0192",
    gunId: "G3",
    spotId: "B1",
    status: "settled",
    blockReason: "",
    expectedReturnAt: iso(-3 * HOUR),
    amount: 68.5,
    note: "白班已结清的历史单据。",
    createdAt: iso(-5 * HOUR),
    enteredAt: iso(-5 * HOUR),
    unpluggedAt: iso(-3.2 * HOUR),
    settledAt: iso(-3 * HOUR),
    shiftCreated: "早班",
    shiftSettled: "中班",
    events: [
      { at: iso(-5 * HOUR), text: "车辆进场，绑定3号枪 / B1车位，开始充电。" },
      { at: iso(-3.2 * HOUR), text: "确认已拔枪。" },
      { at: iso(-3 * HOUR), text: "结清 68.5 元，车辆离场。" }
    ]
  }
];

const seedRepairs: RepairRecord[] = [
  {
    id: "seed-repair-1",
    gunId: "G4",
    fault: "充电跳枪，枪头卡扣松动。",
    reporter: "王强",
    reportedAt: iso(-50 * MINUTE),
    fixNote: "",
    fixer: "",
    fixedAt: null,
    confirmer: "",
    confirmedAt: null,
    status: "reported"
  }
];

export function buildSeedState(): LedgerState {
  return {
    version: stateVersion,
    currentShift: "晚班",
    currentAttendant: "王强",
    guns: seedGuns,
    spots: seedSpots,
    orders: seedOrders,
    repairs: seedRepairs,
    handovers: []
  };
}
