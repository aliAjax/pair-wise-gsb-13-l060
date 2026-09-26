<script setup lang="ts">
// 枪位看板：设备状态与占用判定的实时视图，拔枪、结清、候位上桩在此操作。
import { ref } from "vue";
import { useLedgerStore } from "./store";
import { blockerOf, formatTime } from "./domain";

const store = useLedgerStore();
const settleAmount = ref<Record<string, string>>({});

function doSettle(orderId: string) {
  const raw = Number(settleAmount.value[orderId]);
  if (!Number.isFinite(raw) || raw < 0) return;
  store.settleOrder(orderId, raw);
  delete settleAmount.value[orderId];
}

function badgeClass(item: ReturnType<typeof useLedgerStore>["availability"][number]): string {
  if (item.hardware === "待修") return "badge-danger";
  if (item.hardware === "修复待确认") return "badge-warn";
  if (item.active) return item.active.stage === "unplugged" ? "badge-warn" : "badge-info";
  return "badge-ok";
}

function badgeText(item: ReturnType<typeof useLedgerStore>["availability"][number]): string {
  if (item.hardware === "待修") return "车位停用";
  if (item.hardware === "修复待确认") return "修复待确认";
  if (item.active) return item.active.stage === "unplugged" ? "已拔枪待结清" : "充电占用";
  return item.waiting.length ? "空闲·有候位" : "空闲可接单";
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>枪位看板</h2>
      <p class="panel-tip">同一把枪上前单未确认拔枪并结清时，后车只能在候位区排队。</p>
    </div>

    <div class="gun-grid">
      <article v-for="item in store.availability" :key="item.gun.id" class="gun-card">
        <div class="gun-head">
          <div>
            <p class="gun-name">{{ item.gun.id }} <span class="gun-power">{{ item.gun.powerKw }}kW</span></p>
            <p class="gun-stall">车位 {{ item.gun.stallId }}</p>
          </div>
          <span class="badge" :class="badgeClass(item)">{{ badgeText(item) }}</span>
        </div>

        <p class="gun-reason" :class="{ 'reason-block': !item.canCharge }">{{ item.reason }}</p>

        <div v-if="item.active" class="active-box">
          <div class="active-line">
            <strong>{{ item.active.plate }}</strong>
            <span class="stage-tag">{{ item.active.stage === "charging" ? "充电中" : "已拔枪待结清" }}</span>
          </div>
          <p class="muted">进场 {{ formatTime(item.active.enteredAt) }}
            <template v-if="item.active.unpluggedAt"> · 拔枪 {{ formatTime(item.active.unpluggedAt) }}</template>
          </p>
          <p v-if="item.active.expectedReturn" class="muted">车主预计回来：{{ item.active.expectedReturn }}</p>
          <p v-if="item.active.memo" class="muted">备注：{{ item.active.memo }}</p>

          <div v-if="item.active.stage === 'charging'" class="row-actions">
            <button type="button" @click="store.confirmUnplug(item.active?.id ?? '')">确认拔枪</button>
            <span class="hint">拔枪后仍占枪，结清才释放</span>
          </div>
          <div v-else class="settle-row">
            <input
              v-model="settleAmount[item.active.id]"
              type="number"
              min="0"
              step="0.01"
              placeholder="充电金额(元)"
            />
            <button type="button" :disabled="!settleAmount[item.active.id]" @click="doSettle(item.active?.id ?? '')">
              确认结清离站
            </button>
          </div>
        </div>

        <div v-if="item.waiting.length" class="wait-box">
          <p class="wait-title">候位区（{{ item.waiting.length }}）</p>
          <div v-for="waiter in item.waiting" :key="waiter.id" class="wait-item">
            <div>
              <strong>{{ waiter.plate }}</strong>
              <p class="muted">卡点：{{ blockerOf(waiter, store.orders, store.repairs) }}</p>
              <p class="muted">进场 {{ formatTime(waiter.enteredAt) }}<template v-if="waiter.phone"> · {{ waiter.phone }}</template></p>
            </div>
            <button
              type="button"
              class="secondary"
              :disabled="!item.canCharge"
              :title="item.canCharge ? '安排上桩' : '枪位未释放或设备停用'"
              @click="store.promoteWaiting(waiter.id)"
            >
              安排上桩
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
