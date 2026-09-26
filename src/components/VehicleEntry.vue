<script setup lang="ts">
import { computed, reactive } from "vue";
import { ElMessage } from "element-plus";
import { useLedgerStore } from "../stores/ledger";
import { checkGunAvailable } from "../services/occupancy";
import { localInputToIso } from "../services/time";

const store = useLedgerStore();

function defaultReturnAt(): string {
  const date = new Date(Date.now() + 60 * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

const form = reactive({
  plate: "",
  phone: "",
  gunId: store.guns[0]?.id ?? "",
  expectedReturn: defaultReturnAt(),
  note: ""
});

const preview = computed(() => {
  if (!form.gunId) return { blocked: false, reason: "", spotName: "" };
  const gun = store.guns.find((item) => item.id === form.gunId);
  const block = checkGunAvailable(store, form.gunId);
  return {
    blocked: block.blocked,
    reason: block.reason,
    spotName: store.spots.find((spot) => spot.id === gun?.spotId)?.name ?? ""
  };
});

function submit() {
  if (!form.plate.trim()) {
    ElMessage.warning("请填写车牌号。");
    return;
  }
  if (!form.expectedReturn) {
    ElMessage.warning("请填写车主预计回位时间。");
    return;
  }
  const result = store.vehicleEnter({
    plate: form.plate.trim(),
    phone: form.phone.trim(),
    gunId: form.gunId,
    expectedReturnAt: localInputToIso(form.expectedReturn),
    note: form.note.trim()
  });
  if (result.ok) {
    ElMessage.success(result.message);
    form.plate = "";
    form.phone = "";
    form.note = "";
    form.expectedReturn = defaultReturnAt();
  } else {
    ElMessage.error(result.message);
  }
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>车辆进场登记</h2>
    <p class="panel-hint">绑定充电枪号与车位；枪未释放或停用时自动转候位区并写明卡点。</p>
    <div class="form-grid">
      <label>
        车牌号 <span class="required">*</span>
        <input v-model="form.plate" placeholder="如：京A·D8219" required />
      </label>
      <label>
        联系电话
        <input v-model="form.phone" placeholder="便于催结/通知上枪" />
      </label>
      <label>
        充电枪 <span class="required">*</span>
        <select v-model="form.gunId">
          <option v-for="gun in store.guns" :key="gun.id" :value="gun.id">
            {{ gun.name }}（{{ gun.powerKw }}kW / {{ store.spots.find((s) => s.id === gun.spotId)?.name }}）
          </option>
        </select>
      </label>
      <div class="bind-preview" :class="{ blocked: preview.blocked }">
        <template v-if="preview.blocked">
          <strong>该枪暂不可用 → 进入候位区</strong>
          <span>{{ preview.reason }}</span>
        </template>
        <template v-else>
          <strong>可直接上枪</strong>
          <span>将绑定 {{ store.guns.find((g) => g.id === form.gunId)?.name }} / {{ preview.spotName }}</span>
        </template>
      </div>
      <label>
        车主预计回位时间 <span class="required">*</span>
        <input v-model="form.expectedReturn" type="datetime-local" required />
      </label>
      <label>
        现场备注
        <textarea v-model="form.note" placeholder="车主去向、催结情况等" />
      </label>
      <button type="submit">登记进场</button>
    </div>
  </form>
</template>
