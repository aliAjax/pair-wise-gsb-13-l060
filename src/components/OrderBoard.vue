<script setup lang="ts">
import { reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import { useLedgerStore } from "../stores/ledger";
import { ORDER_STATUS_META, type ChargeOrder } from "../types";
import { formatTime, overdueText } from "../services/time";

const store = useLedgerStore();

const amounts = reactive<Record<string, string>>({});
watch(
  () => store.orders.map((order) => order.id),
  (ids) => {
    ids.forEach((id) => {
      if (amounts[id] === undefined) amounts[id] = "";
    });
  },
  { immediate: true }
);

function gunName(order: ChargeOrder) {
  return store.guns.find((gun) => gun.id === order.gunId)?.name ?? order.gunId ?? "—";
}
function spotName(order: ChargeOrder) {
  return store.spots.find((spot) => spot.id === order.spotId)?.name ?? order.spotId ?? "—";
}

function callAction(message: string, ok = true) {
  ok ? ElMessage.success(message) : ElMessage.error(message);
}

function doUnplug(order: ChargeOrder) {
  const result = store.confirmUnplugged(order.id);
  callAction(result.message, result.ok);
}

function doSettle(order: ChargeOrder) {
  const value = Number(amounts[order.id]);
  const result = store.settleOrder(order.id, value);
  callAction(result.message, result.ok);
  if (result.ok) amounts[order.id] = "";
}

function doAssign(order: ChargeOrder) {
  const result = store.assignWaitingOrder(order.id);
  callAction(result.message, result.ok);
}

function doCancel(order: ChargeOrder) {
  const result = store.cancelWaitingOrder(order.id);
  callAction(result.message, result.ok);
}

const waitingOrders = () => store.orders.filter((order) => order.status === "waiting");
const activeOrders = () =>
  store.orders.filter((order) => order.status === "charging" || order.status === "unplugged");
const historyOrders = () =>
  store.orders.filter((order) => order.status === "settled" || order.status === "cancelled").slice(0, 8);

function isOverdue(order: ChargeOrder) {
  return order.status !== "settled" && order.status !== "cancelled"
    ? new Date(order.expectedReturnAt).getTime() < Date.now()
    : false;
}
</script>

<template>
  <section class="panel list-panel">
    <div class="toolbar">
      <h2>充电服务台账</h2>
      <span class="legend">
        <i class="dot dot-ok" />充电中
        <i class="dot dot-accent" />待结清
        <i class="dot dot-warn" />候位
      </span>
    </div>

    <!-- 候位区 -->
    <section class="order-group">
      <h3 class="group-title warn-title">候位区（{{ waitingOrders().length }}）</h3>
      <div v-if="waitingOrders().length === 0" class="empty">暂无候位车辆</div>
      <article v-for="order in waitingOrders()" :key="order.id" class="record waiting">
        <div class="record-head">
          <p class="record-title">{{ order.plate }} <small>{{ order.phone || '未留电话' }}</small></p>
          <span class="status status-warn">{{ ORDER_STATUS_META[order.status].label }}</span>
        </div>
        <p class="block-reason">卡点：{{ order.blockReason }}</p>
        <div class="details">
          <span>意向枪/位：{{ gunName(order) }} / {{ spotName(order) }}</span>
          <span>预计回位：{{ formatTime(order.expectedReturnAt) }}（{{ overdueText(order.expectedReturnAt) }}）</span>
          <span>进场登记：{{ formatTime(order.createdAt) }}</span>
          <span>建单班次：{{ order.shiftCreated }}</span>
        </div>
        <p v-if="order.note" class="note">{{ order.note }}</p>
        <div class="actions">
          <button type="button" @click="doAssign(order)">转入枪位开始充电</button>
          <button class="secondary" type="button" @click="doCancel(order)">车主离开 / 取消候位</button>
        </div>
      </article>
    </section>

    <!-- 在场充电 / 待结清 -->
    <section class="order-group">
      <h3 class="group-title">在场车辆（{{ activeOrders().length }}）</h3>
      <div v-if="activeOrders().length === 0" class="empty">暂无在场充电车辆</div>
      <article
        v-for="order in activeOrders()"
        :key="order.id"
        class="record"
        :class="order.status === 'unplugged' ? 'unplugged' : 'charging'"
      >
        <div class="record-head">
          <p class="record-title">{{ order.plate }} <small>{{ order.phone || '未留电话' }}</small></p>
          <span class="status" :class="order.status === 'unplugged' ? 'status-accent' : 'status-ok'">
            {{ ORDER_STATUS_META[order.status].label }}
          </span>
        </div>
        <div class="details">
          <span>枪号 / 车位：{{ gunName(order) }} / {{ spotName(order) }}</span>
          <span :class="{ overdue: isOverdue(order) }">
            预计回位：{{ formatTime(order.expectedReturnAt) }}（{{ overdueText(order.expectedReturnAt) }}）
          </span>
          <span>开始充电：{{ formatTime(order.enteredAt) }}</span>
          <span v-if="order.status === 'unplugged'">拔枪时间：{{ formatTime(order.unpluggedAt) }}</span>
        </div>
        <p v-if="order.note" class="note">{{ order.note }}</p>

        <div v-if="order.status === 'charging'" class="actions">
          <button type="button" @click="doUnplug(order)">确认拔枪（结清前继续占枪）</button>
        </div>
        <div v-else class="settle-row">
          <input v-model="amounts[order.id]" type="number" min="0" step="0.01" placeholder="结算金额（元）" />
          <button type="button" @click="doSettle(order)">结清并释放枪位</button>
        </div>
      </article>
    </section>

    <!-- 历史单据 -->
    <details class="history">
      <summary>已结束单据（{{ historyOrders().length }}）</summary>
      <table class="history-table">
        <thead>
          <tr>
            <th>车牌</th>
            <th>状态</th>
            <th>枪/位</th>
            <th>金额</th>
            <th>结清时间</th>
            <th>班次</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in historyOrders()" :key="order.id">
            <td>{{ order.plate }}</td>
            <td>{{ ORDER_STATUS_META[order.status].label }}</td>
            <td>{{ gunName(order) }} / {{ spotName(order) }}</td>
            <td>{{ order.status === "settled" ? `¥${order.amount.toFixed(2)}` : "—" }}</td>
            <td>{{ formatTime(order.settledAt) }}</td>
            <td>{{ order.shiftCreated }} → {{ order.shiftSettled ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </section>
</template>
