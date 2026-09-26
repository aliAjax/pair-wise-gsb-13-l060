<script setup lang="ts">
// 订单台账：车辆进场绑定枪号车位（占用时自动落候位区），并保留全部订单流水。
import { computed, reactive, ref } from "vue";
import { useLedgerStore } from "./store";
import { STAGE_LABEL, formatTime, gunAvailability } from "./domain";

const store = useLedgerStore();

const form = reactive({ plate: "", phone: "", gunId: "", expectedReturn: "", memo: "" });
const feedback = ref("");
const feedbackTone = ref("ok");
const scope = ref<"active" | "all">("active");

const selectableGuns = computed(() =>
  store.guns.map((gun) => ({
    gun,
    avail: gunAvailability(gun, store.orders, store.repairs),
  }))
);

const list = computed(() => {
  const sorted = [...store.orders].sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
  return scope.value === "active" ? sorted.filter((order) => order.stage !== "settled") : sorted;
});

function submit() {
  if (!form.plate.trim() || !form.gunId) {
    feedback.value = "请填写车牌并选择绑定枪号";
    feedbackTone.value = "err";
    return;
  }
  const { order, waiting } = store.vehicleEntry({ ...form });
  feedback.value = waiting
    ? `${order.plate} 已进入候位区，卡点：${order.blockerNote}`
    : `${order.plate} 已绑定 ${order.gunId} / 车位 ${order.stallId}，开始充电`;
  feedbackTone.value = waiting ? "warn" : "ok";
  form.plate = "";
  form.phone = "";
  form.gunId = "";
  form.expectedReturn = "";
  form.memo = "";
}
</script>

<template>
  <div class="two-col">
    <form class="panel entry-panel" @submit.prevent="submit">
      <div class="panel-head">
        <h2>车辆进场登记</h2>
        <p class="panel-tip">绑定枪号与车位；枪被占用或停用时自动转候位并写明卡点。</p>
      </div>
      <div class="form-grid">
        <label>
          车牌号
          <input v-model="form.plate" placeholder="如 沪A·D1234" required />
        </label>
        <label>
          联系电话
          <input v-model="form.phone" placeholder="便于联系挪车" />
        </label>
        <label>
          绑定枪号
          <select v-model="form.gunId" required>
            <option value="">请选择枪号</option>
            <option
              v-for="{ gun, avail } in selectableGuns"
              :key="gun.id"
              :value="gun.id"
            >
              {{ gun.id }}（车位{{ gun.stallId }}）— {{ avail.canCharge ? "可接单" : avail.reason }}
            </option>
          </select>
        </label>
        <label>
          车主预计回来
          <input v-model="form.expectedReturn" placeholder="如 22:00 左右" />
        </label>
        <label class="full">
          现场备注
          <textarea v-model="form.memo" placeholder="候位去向、特殊情况等" />
        </label>
        <button type="submit">登记进场</button>
        <p v-if="feedback" class="feedback" :class="feedbackTone">{{ feedback }}</p>
      </div>
    </form>

    <section class="panel">
      <div class="panel-head row-head">
        <h2>充电订单台账</h2>
        <div class="segmented">
          <button type="button" :class="{ on: scope === 'active' }" @click="scope = 'active'">在场未结</button>
          <button type="button" :class="{ on: scope === 'all' }" @click="scope = 'all'">全部流水</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="ledger-table">
          <thead>
            <tr>
              <th>车牌</th>
              <th>枪号/车位</th>
              <th>状态</th>
              <th>进场 / 拔枪 / 结清</th>
              <th>金额</th>
              <th>卡点 / 备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in list" :key="order.id" :class="{ 'row-waiting': order.stage === 'waiting' }">
              <td>
                <strong>{{ order.plate }}</strong>
                <span class="muted block">{{ order.phone || "未留电话" }} · {{ order.enteredBy }}登记</span>
              </td>
              <td>{{ order.gunId }} / {{ order.stallId }}</td>
              <td><span class="stage-tag" :data-stage="order.stage">{{ STAGE_LABEL[order.stage] }}</span></td>
              <td class="time-cell">
                {{ formatTime(order.enteredAt) }}
                <span v-if="order.unpluggedAt" class="block muted">{{ formatTime(order.unpluggedAt) }} 拔枪</span>
                <span v-if="order.settledAt" class="block muted">{{ formatTime(order.settledAt) }} 结清</span>
              </td>
              <td>{{ typeof order.amount === "number" ? `¥${order.amount.toFixed(2)}` : "—" }}</td>
              <td class="note-cell">
                <template v-if="order.stage === 'waiting'">
                  <span class="blocker">卡点：{{ order.blockerNote || "等待上桩" }}</span>
                </template>
                <template v-else-if="order.expectedReturn">
                  <span class="block">回来时间：{{ order.expectedReturn }}</span>
                </template>
                <span v-if="order.memo" class="muted block">{{ order.memo }}</span>
              </td>
            </tr>
            <tr v-if="list.length === 0">
              <td colspan="6" class="empty">暂无订单</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
