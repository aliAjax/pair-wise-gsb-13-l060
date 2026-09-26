// Node 冒烟测试：用极简 localStorage 桩驱动 Pinia 台账 store，验证核心业务闭环
import { createPinia, setActivePinia } from "pinia";
import { useLedgerStore } from "../src/stores/ledger.ts";

// localStorage 桩（Node 环境）
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => void memory.set(key, String(value)),
  removeItem: (key) => void memory.delete(key),
  clear: () => memory.clear()
};

let pass = 0;
let fail = 0;
function assert(condition, message) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${message}`);
  } else {
    fail++;
    console.error(`  ❌ ${message}`);
  }
}

function laterIso(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

// ---- 场景 1：枪被占用，后车进候位并写明卡点 ----
setActivePinia(createPinia());
let store = useLedgerStore();

let r = store.vehicleEnter({
  plate: "京测0001",
  phone: "13800000000",
  gunId: "G1", // 种子数据里 G1 正在充电
  expectedReturnAt: laterIso(60),
  note: ""
});
let waiting = store.orders.find((o) => o.plate === "京测0001");
assert(r.ok, "进场登记返回成功");
assert(waiting?.status === "waiting", "G1被占用，新单进入候位区");
assert(!!waiting?.blockReason && waiting.blockReason.includes("京A·D8219"), "候位单写明卡点（前车车牌）");
assert(waiting.enteredAt === null, "候位单未产生上枪时间");

// ---- 场景 2：空枪可直接上枪 ----
r = store.vehicleEnter({
  plate: "京测0002",
  phone: "",
  gunId: "G3", // 种子 G3 空闲
  expectedReturnAt: laterIso(60),
  note: ""
});
const charging = store.orders.find((o) => o.plate === "京测0002");
assert(charging?.status === "charging", "空闲枪直接开始充电");
assert(charging.spotId === "B1", "枪与车位按资料自动绑定");

// 候位车在枪未释放前不能转入
r = store.assignWaitingOrder(waiting.id);
assert(!r.ok, "前车未拔枪结清，候位车不能上枪");

// ---- 场景 3：拔枪但未结清，枪仍占用；结清后释放 ----
const seedOnG1 = store.orders.find((o) => o.id === "seed-order-1");
r = store.confirmUnplugged(seedOnG1.id);
assert(r.ok && seedOnG1.status === "unplugged", "确认拔枪成功");
r = store.assignWaitingOrder(waiting.id);
assert(!r.ok, "已拔枪但未结清，枪仍不释放");

// 未拔枪不能结清
r = store.settleOrder(charging.id, 50);
assert(!r.ok, "充电中订单不能直接结清");
store.confirmUnplugged(charging.id);
r = store.settleOrder(charging.id, 50);
assert(r.ok && charging.status === "settled" && charging.amount === 50, "拔枪后结清成功");

r = store.settleOrder(seedOnG1.id, 88);
assert(r.ok, "G1前车结清");
r = store.assignWaitingOrder(waiting.id);
assert(r.ok && waiting.status === "charging", "枪释放后候位车可转入");
assert(waiting.blockReason === "", "上枪后卡点清空");

// ---- 场景 4：报修立即停用，修复未确认不接单，确认后恢复（G3已结清空闲） ----
r = store.reportRepair({ gunId: "G3", fault: "屏幕不亮" });
assert(r.ok, "G3报修成功");
r = store.vehicleEnter({
  plate: "京测0003",
  phone: "",
  gunId: "G3",
  expectedReturnAt: laterIso(60),
  note: ""
});
const w3 = store.orders.find((o) => o.plate === "京测0003");
assert(w3.status === "waiting" && w3.blockReason.includes("报修停用"), "报修关联车位立即停用，新单候位");

const repair = store.repairs.find((x) => x.gunId === "G3" && x.status !== "confirmed");
r = store.confirmRepair(repair.id);
assert(!r.ok, "修复记录未登记不能确认恢复");
r = store.fixRepair(repair.id, "更换显示屏");
assert(r.ok && repair.status === "fixed", "修复登记为待确认");
r = store.assignWaitingOrder(w3.id);
assert(!r.ok, "已修复待确认期间仍不能接单");
r = store.confirmRepair(repair.id);
assert(r.ok && repair.status === "confirmed", "确认修复");
r = store.assignWaitingOrder(w3.id);
assert(r.ok && w3.status === "charging", "确认后候位车可上枪");

// ---- 场景 5：交接班未确认责任留原班，逐项核对+签字才转移 ----
store.setAttendant("夜班张三");
r = store.createHandover("早班李四", "");
assert(r.ok, "生成交接单");
const h = store.pendingHandover;
assert(!!h && h.vehicles.length >= 1, "交接快照含在场车辆");
assert(h.pendingOrders.some((i) => i.id === waiting.id), "交接快照含未结订单");
assert(h.pendingRepairs.some((i) => i.label.includes("4号枪")), "交接快照含待修设备(G4报修中)");

r = store.confirmHandover(h.id, "早班李四");
assert(!r.ok, "未逐项核对不能确认");
h.checklist.forEach((item) => (item.checked = true));
r = store.confirmHandover(h.id, "");
assert(!r.ok, "接班人未签字不能确认");
r = store.confirmHandover(h.id, "早班李四");
assert(r.ok && h.confirmedByName === "早班李四", "核对+签字后交接确认");
assert(store.currentShift === "早班" && store.currentAttendant === "早班李四", "接班后班次/负责人转移");
assert(store.pendingHandover === null, "确认后无待办交接");

// ---- 场景 6：localStorage 持久化，重开接着处理 ----
setActivePinia(createPinia());
store = useLedgerStore();
assert(store.currentShift === "早班", "重开后班次保留");
assert(store.orders.some((o) => o.plate === "京测0003" && o.status === "charging"), "重开后订单状态保留");
assert(store.repairs.some((x) => x.gunId === "G3" && x.status === "confirmed"), "重开后修复记录保留");

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
