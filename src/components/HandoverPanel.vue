<script setup lang="ts">
import { computed, reactive } from "vue";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { useLedgerStore } from "../stores/ledger";
import { formatTime } from "../services/time";

const store = useLedgerStore();
const { pendingHandover, handovers } = storeToRefs(store);

const createForm = reactive({ toName: "", note: "" });
const signName = reactive({ value: "" });

const currentPending = computed(() => pendingHandover.value);
const pastHandovers = computed(() =>
  handovers.value.filter((handover) => handover.confirmedAt).slice(0, 6)
);

function create() {
  if (!createForm.toName.trim()) {
    ElMessage.warning("请填写接班人姓名。");
    return;
  }
  const result = store.createHandover(createForm.toName.trim(), createForm.note.trim());
  if (result.ok) {
    ElMessage.success(result.message);
    createForm.note = "";
    createForm.toName = "";
  } else {
    ElMessage.error(result.message);
  }
}

function toggle(handoverId: string, key: string) {
  store.toggleHandoverItem(handoverId, key);
}

function confirm(handoverId: string) {
  if (!signName.value.trim()) {
    ElMessage.warning("接班人需填写姓名签字确认。");
    return;
  }
  const result = store.confirmHandover(handoverId, signName.value);
  if (result.ok) {
    ElMessage.success(result.message);
    signName.value = "";
  } else {
    ElMessage.error(result.message);
  }
}
</script>

<template>
  <section class="panel handover-panel">
    <h2>交接班核对</h2>

    <!-- 待接班人确认 -->
    <article v-if="currentPending" class="handover-card pending-handover">
      <header class="handover-head">
        <div>
          <strong>{{ currentPending.shift }} → 接班人：{{ currentPending.toName }}</strong>
          <p class="gun-line muted-line">
            交班人 {{ currentPending.fromName }} · 生成于 {{ formatTime(currentPending.createdAt) }}
          </p>
        </div>
        <span class="status status-warn">待接班人确认</span>
      </header>

      <div class="check-cols">
        <div class="check-col">
          <h4>在场车辆逐辆核对（{{ currentPending.vehicles.length }}）</h4>
          <label v-for="item in currentPending.vehicles" :key="item.id" class="snapshot-item static-item">
            <input type="checkbox" disabled :checked="true" />
            <span><strong>{{ item.label }}</strong>：{{ item.detail }}</span>
          </label>
          <p v-if="currentPending.vehicles.length === 0" class="empty small">无在场车辆</p>
        </div>
        <div class="check-col">
          <h4>未结订单（{{ currentPending.pendingOrders.length }}）</h4>
          <label v-for="item in currentPending.pendingOrders" :key="item.id" class="snapshot-item static-item">
            <input type="checkbox" disabled :checked="true" />
            <span><strong>{{ item.label }}</strong>：{{ item.detail }}</span>
          </label>
          <p v-if="currentPending.pendingOrders.length === 0" class="empty small">无未结订单</p>
        </div>
        <div class="check-col">
          <h4>待修设备（{{ currentPending.pendingRepairs.length }}）</h4>
          <label v-for="item in currentPending.pendingRepairs" :key="item.id" class="snapshot-item static-item">
            <input type="checkbox" disabled :checked="true" />
            <span><strong>{{ item.label }}</strong>：{{ item.detail }}</span>
          </label>
          <p v-if="currentPending.pendingRepairs.length === 0" class="empty small">无待修设备</p>
        </div>
      </div>

      <div v-if="currentPending.note" class="note">交班备注：{{ currentPending.note }}</div>

      <div class="confirm-checks">
        <h4>接班人逐项核对</h4>
        <label v-for="item in currentPending.checklist" :key="item.key" class="snapshot-item">
          <input type="checkbox" :checked="item.checked" @change="toggle(currentPending.id, item.key)" />
          <span>{{ item.label }}</span>
        </label>
      </div>

      <div class="sign-row">
        <input v-model="signName.value" placeholder="接班人签字（填写姓名）" />
        <button
          type="button"
          :disabled="!currentPending.checklist.every((item) => item.checked)"
          @click="confirm(currentPending.id)"
        >
          接班人确认，责任转入新班
        </button>
      </div>
      <p class="rule-hint">未完成三项核对或未签字前，责任仍留在原班（{{ currentPending.fromName }}）。</p>
    </article>

    <!-- 生成交接单 -->
    <form v-else class="create-handover" @submit.prevent="create">
      <p class="panel-hint">
        系统将快照当前在场车辆（{{ store.onSiteOrders.length }}）、未结订单（{{ store.unsettledOrders.length }}）、待修设备（{{ store.openRepairs.length }}），
        供接班人逐辆核对。
      </p>
      <label>
        接班人姓名 <span class="required">*</span>
        <input v-model="createForm.toName" placeholder="如：李明" required />
      </label>
      <label>
        交班说明
        <textarea v-model="createForm.note" placeholder="异常情况、未处理事项说明" />
      </label>
      <button type="submit">生成交接单，等待接班人确认</button>
    </form>

    <!-- 历史交接 -->
    <details v-if="pastHandovers.length" class="history">
      <summary>已确认交接记录（{{ pastHandovers.length }}）</summary>
      <ul class="handover-history">
        <li v-for="handover in pastHandovers" :key="handover.id">
          <strong>{{ handover.shift }}</strong>：{{ handover.fromName }} → {{ handover.confirmedByName }}
          （接班 {{ handover.toName }}），确认于 {{ formatTime(handover.confirmedAt) }}；
          在场 {{ handover.vehicles.length }} 辆 / 未结 {{ handover.pendingOrders.length }} 单 /
          待修 {{ handover.pendingRepairs.length }} 台
        </li>
      </ul>
    </details>
  </section>
</template>
