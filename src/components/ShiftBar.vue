<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLedgerStore } from "../stores/ledger";
import { SHIFTS } from "../types";
import { formatTime } from "../services/time";

const store = useLedgerStore();
const { currentShift, currentAttendant, pendingHandover } = storeToRefs(store);

const nowText = ref(formatTime(new Date().toISOString()));
let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    nowText.value = formatTime(new Date().toISOString());
  }, 30_000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <section class="shift-bar">
    <div class="shift-controls">
      <label class="shift-field">
        当前班次
        <select :value="currentShift" @change="store.setShift(($event.target as HTMLSelectElement).value)">
          <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
        </select>
      </label>
      <label class="shift-field">
        当班负责人
        <input
          :value="currentAttendant"
          placeholder="填写姓名"
          @input="store.setAttendant(($event.target as HTMLInputElement).value)"
        />
      </label>
      <span class="clock">{{ nowText }}</span>
    </div>
    <p v-if="pendingHandover" class="responsibility-banner">
      ⚠ {{ pendingHandover.shift }}交接单待接班人
      <strong>{{ pendingHandover.toName }}</strong>
      确认（生成于 {{ formatTime(pendingHandover.createdAt) }}）。接班人未逐项核对并签字前，责任仍留在原班（
      {{ pendingHandover.fromName }}）。
    </p>
  </section>
</template>
