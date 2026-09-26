<script setup lang="ts">
import { computed, ref } from "vue";
import ShiftBar from "./components/ShiftBar.vue";
import VehicleEntry from "./components/VehicleEntry.vue";
import OrderBoard from "./components/OrderBoard.vue";
import DevicePanel from "./components/DevicePanel.vue";
import HandoverPanel from "./components/HandoverPanel.vue";
import { useLedgerStore } from "./stores/ledger";

const store = useLedgerStore();

const tabs = [
  { key: "service", label: "充电服务" },
  { key: "devices", label: "设备报修" },
  { key: "handover", label: "交接班" }
] as const;

type TabKey = (typeof tabs)[number]["key"];
const activeTab = ref<TabKey>("service");

const metricList = computed(() => store.metrics);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 充电服务台账</p>
          <h1>加油站充电服务台账</h1>
          <p class="subtitle">
            车辆进场绑定枪号与车位；前单未确认拔枪并结清，后车进候位区写明卡点；枪体报修关联车位立即停用，修复未确认不接单；
            交接班逐辆核对，接班人确认后责任才转移。数据仅保存在本机，重开可接着处理。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Element Plus</span>
          <span class="tag">Pinia</span>
          <span class="tag">本机保存</span>
        </div>
      </header>

      <ShiftBar />

      <section class="metrics">
        <article v-for="metric in metricList" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-show="activeTab === 'service'" class="workspace service-layout">
        <VehicleEntry />
        <OrderBoard />
      </section>
      <section v-show="activeTab === 'devices'" class="workspace single-layout">
        <DevicePanel />
      </section>
      <section v-show="activeTab === 'handover'" class="workspace single-layout">
        <HandoverPanel />
      </section>

      <footer class="footer">台账数据保存在本机浏览器 localStorage，清空浏览器数据会丢失记录。</footer>
    </div>
  </main>
</template>
