<script setup lang="ts">
// 交接班：逐辆核对在场车辆、未结订单、待修设备；接班人未确认，责任仍留在原班。
import { computed, reactive } from "vue";
import { useLedgerStore } from "./store";
import { SHIFT_NAMES } from "./types";
import type { ShiftName } from "./types";
import { formatTime } from "./domain";

const store = useLedgerStore();

const pending = computed(() => store.pendingHandover);
const rejectedLast = computed(
  () => store.handovers.find((handover) => handover.status === "rejected")
);

const form = reactive<{ fromShift: ShiftName; toShift: ShiftName; note: string }>({
  fromShift: store.responsibleShift,
  toShift: "早班",
  note: "",
});

const toOptions = computed(() => SHIFT_NAMES.filter((shift) => shift !== form.fromShift));
const allChecked = computed(
  () => !!pending.value && pending.value.snapshot.checks.every((check) => check.checked)
);
const checkedCount = computed(
  () => pending.value?.snapshot.checks.filter((check) => check.checked).length ?? 0
);

function create() {
  if (!form.toShift || form.fromShift === form.toShift) return;
  store.createHandover(form.fromShift, form.toShift, form.note);
  form.note = "";
}

const history = computed(() =>
  [...store.handovers]
    .filter((handover) => handover.status !== "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

function statusClass(status: string): string {
  if (status === "confirmed") return "badge-ok";
  if (status === "rejected") return "badge-danger";
  return "badge-warn";
}

const statusText: Record<string, string> = {
  pending: "待接班人确认",
  confirmed: "已确认接班",
  rejected: "已驳回",
  draft: "草稿",
};
</script>

<template>
  <div class="two-col">
    <!-- 待接班人确认：逐项核对 -->
    <section v-if="pending" class="panel">
      <div class="panel-head">
        <h2>交接班核对单 {{ pending.id.slice(-6) }}</h2>
        <p class="panel-tip">
          {{ pending.fromShift }} → {{ pending.toShift }} · 发起于 {{ formatTime(pending.createdAt) }}
        </p>
      </div>

      <div class="responsibility-banner">
        接班人尚未确认，当前现场责任仍由 <strong>{{ pending.fromShift }}</strong> 承担；
        全部核对项勾选确认后才移交 {{ pending.toShift }}。
      </div>

      <div class="snapshot-summary">
        <span>在场车辆 {{ pending.snapshot.onSite.length }}</span>
        <span>未结订单 {{ pending.snapshot.unsettled.length }}</span>
        <span>待修设备 {{ pending.snapshot.broken.length }}</span>
      </div>

      <div class="check-list">
        <label v-for="check in pending.snapshot.checks" :key="check.key" class="check-item">
          <input type="checkbox" :checked="check.checked" @change="store.toggleHandoverCheck(pending!.id, check.key)" />
          <span>
            <strong>{{ check.label }}</strong>
            <span class="muted block">{{ check.detail }}</span>
          </span>
        </label>
      </div>

      <div class="row-actions handover-actions">
        <button type="button" :disabled="!allChecked" @click="store.confirmHandover(pending!.id)">
          接班人确认接班（{{ checkedCount }}/{{ pending.snapshot.checks.length }}）
        </button>
        <button type="button" class="danger" @click="store.rejectHandover(pending!.id, '现场核对不符，请原班处理')">
          驳回，责任留原班
        </button>
      </div>
    </section>

    <!-- 发起交接 -->
    <form v-else class="panel entry-panel" @submit.prevent="create">
      <div class="panel-head">
        <h2>发起交接班</h2>
        <p class="panel-tip">提交时冻结在场车辆、未结订单、待修设备快照，供接班人逐辆核对。</p>
      </div>

      <div v-if="rejectedLast" class="feedback err">
        上一张交接单已被驳回（{{ rejectedLast.rejectReason }}），责任仍在 {{ rejectedLast.fromShift }}，处理后重新发起。
      </div>

      <div class="form-grid">
        <label>
          交班班次
          <select v-model="form.fromShift">
            <option v-for="shift in SHIFT_NAMES" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </label>
        <label>
          接班班次
          <select v-model="form.toShift" required>
            <option v-for="shift in toOptions" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </label>
        <label class="full">
          交班说明
          <textarea v-model="form.note" placeholder="现场需重点关注的车辆、设备、款项情况" />
        </label>
        <button type="submit">发起交接，等待接班确认</button>
      </div>
    </form>

    <!-- 交接历史 -->
    <section class="panel">
      <div class="panel-head">
        <h2>交接记录</h2>
        <p class="panel-tip">快照内容保留建单时的现场清单，确认后仍可追溯。</p>
      </div>
      <div class="record-grid">
        <div v-if="history.length === 0" class="empty">暂无已完成交接</div>
        <article v-for="handover in history" :key="handover.id" class="repair-card">
          <div class="record-head">
            <p class="record-title">{{ handover.fromShift }} → {{ handover.toShift }}</p>
            <span class="badge" :class="statusClass(handover.status)">{{ statusText[handover.status] }}</span>
          </div>
          <div class="details">
            <span>发起：{{ formatTime(handover.createdAt) }}</span>
            <span v-if="handover.confirmedAt">确认：{{ formatTime(handover.confirmedAt) }}</span>
            <span>在场 {{ handover.snapshot.onSite.length }} · 未结 {{ handover.snapshot.unsettled.length }} · 待修 {{ handover.snapshot.broken.length }}</span>
          </div>
          <p v-if="handover.note" class="note">{{ handover.note }}</p>
          <p v-if="handover.rejectReason" class="feedback err inline">驳回原因：{{ handover.rejectReason }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
