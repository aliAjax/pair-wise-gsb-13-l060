<script setup lang="ts">
// 充电服务台账外壳：班次栏、现场指标与四个台账页签。
import { computed, ref } from "vue";
import { useLedgerStore } from "./charging/store";
import { SHIFT_NAMES } from "./charging/types";
import StallBoard from "./charging/StallBoard.vue";
import OrdersPanel from "./charging/OrdersPanel.vue";
import RepairsPanel from "./charging/RepairsPanel.vue";
import HandoverPanel from "./charging/HandoverPanel.vue";

const store = useLedgerStore();
const tab = ref<"stall" | "orders" | "repairs" | "handover">("stall");

const tabs = [
  { key: "stall" as const, label: "枪位看板" },
  { key: "orders" as const, label: "订单台账" },
  { key: "repairs" as const, label: "设备维修", badge: () => store.broken.length },
  { key: "handover" as const, label: "交接班" },
];

const waitingCount = computed(
  () => store.orders.filter((order) => order.stage === "waiting").length
);
const availableCount = computed(() => store.availability.filter((item) => item.canCharge).length);

const metrics = computed(() => [
  { label: "在场车辆", value: store.onSite.length, hint: `候位 ${waitingCount.value} 辆` },
  { label: "未结订单", value: store.unsettled.length, hint: "未结清不释放枪位" },
  { label: "待修设备", value: store.broken.length, hint: "关联车位停用中" },
  { label: "可接单枪位", value: availableCount.value, hint: `共 ${store.guns.length} 把枪` },
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 充电服务台账</p>
          <h1>加油站班次交接 · 充电台账</h1>
          <p class="subtitle">
            进场绑定枪号车位，前单未拔枪结清后车落候位区；报修即停用车位，修复确认才恢复；
            交接班逐辆核对，接班人未确认责任留在原班。
          </p>
        </div>
        <div class="stack">
          <span v-for="item in ['Vue3', 'Vite', 'TypeScript', 'Pinia', 'Element Plus']" :key="item" class="tag">
            {{ item }}
          </span>
        </div>
      </header>

      <section class="shift-bar">
        <div class="shift-left">
          <label class="shift-select">
            当前值班班次
            <select
              :value="store.dutyShift"
              :disabled="!!store.pendingHandover"
              @change="store.setDutyShift(($event.target as HTMLSelectElement).value as never)"
            >
              <option v-for="shift in SHIFT_NAMES" :key="shift" :value="shift">{{ shift }}</option>
            </select>
          </label>
          <p v-if="store.pendingHandover" class="shift-notice">
            交接班待确认：责任仍在 <strong>{{ store.responsibleShift }}</strong>，
            接班人 {{ store.pendingHandover.toShift }} 核对确认后才移交
          </p>
          <p v-else class="shift-current">现场责任班次：<strong>{{ store.responsibleShift }}</strong></p>
        </div>
        <nav class="tabs">
          <button
            v-for="item in tabs"
            :key="item.key"
            type="button"
            :class="{ on: tab === item.key }"
            @click="tab = item.key"
          >
            {{ item.label }}
            <em v-if="item.badge && item.badge()" class="tab-badge">{{ item.badge() }}</em>
          </button>
        </nav>
      </section>

      <section class="metrics metrics-four">
        <article v-for="item in metrics" :key="item.label" class="metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.hint }}</small>
        </article>
      </section>

      <StallBoard v-if="tab === 'stall'" />
      <OrdersPanel v-else-if="tab === 'orders'" />
      <RepairsPanel v-else-if="tab === 'repairs'" />
      <HandoverPanel v-else />
    </div>
  </main>
</template>
