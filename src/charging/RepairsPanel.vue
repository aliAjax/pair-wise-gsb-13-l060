<script setup lang="ts">
// 设备维修：报修即停用关联车位；修复需登记并经确认，未确认前不能恢复接单。
import { computed, reactive, ref } from "vue";
import { useLedgerStore } from "./store";
import { formatTime } from "./domain";

const store = useLedgerStore();

const form = reactive({ gunId: "", fault: "" });
const repairNotes = ref<Record<string, string>>({});
const feedback = ref("");

const gunOptions = computed(() =>
  store.guns
    .map((gun) => ({
      gun,
      open: store.repairs.find((ticket) => ticket.gunId === gun.id && !ticket.confirmedAt),
    }))
    .sort((a, b) => Number(Boolean(a.open)) - Number(Boolean(b.open)))
);

function submit() {
  if (!form.gunId || !form.fault.trim()) {
    feedback.value = "请选择枪号并填写故障现象";
    return;
  }
  store.reportRepair(form.gunId, form.fault);
  feedback.value = `已报修，车位立即停用，维修确认前不可接单`;
  form.gunId = "";
  form.fault = "";
}
</script>

<template>
  <div class="two-col">
    <form class="panel entry-panel" @submit.prevent="submit">
      <div class="panel-head">
        <h2>枪体报修</h2>
        <p class="panel-tip">报修后该枪关联车位立即停用，候位车也无法上桩。</p>
      </div>
      <div class="form-grid">
        <label>
          枪号 / 关联车位
          <select v-model="form.gunId" required>
            <option value="">请选择故障枪号</option>
            <option v-for="{ gun, open } in gunOptions" :key="gun.id" :value="gun.id">
              {{ gun.id }}（车位{{ gun.stallId }}）{{ open ? `— ${open.stage}` : "— 运行中" }}
            </option>
          </select>
        </label>
        <label>
          故障现象
          <textarea v-model="form.fault" placeholder="如：扫码无输出、枪头破损、急停报警" required />
        </label>
        <button type="submit">提交报修并停用车位</button>
        <p v-if="feedback" class="feedback warn">{{ feedback }}</p>
      </div>
    </form>

    <section class="panel">
      <div class="panel-head">
        <h2>维修工单</h2>
        <p class="panel-tip">修复记录必须经当班确认，枪位才会恢复接单。</p>
      </div>

      <div class="record-grid">
        <div v-if="store.broken.length === 0" class="empty">当前无待修设备</div>
        <article v-for="ticket in store.broken" :key="ticket.id" class="repair-card">
          <div class="record-head">
            <p class="record-title">{{ ticket.gunId }} · 车位 {{ ticket.stallId }}</p>
            <span class="badge" :class="ticket.stage === '待修' ? 'badge-danger' : 'badge-warn'">
              {{ ticket.stage }}
            </span>
          </div>
          <p class="note">{{ ticket.fault }}</p>
          <div class="details">
            <span>报修：{{ formatTime(ticket.reportedAt) }} · {{ ticket.reportedBy }}</span>
            <span v-if="ticket.repairedAt">修复：{{ formatTime(ticket.repairedAt) }} · {{ ticket.repairedBy }}</span>
            <span v-if="ticket.repairNote" class="full">修复说明：{{ ticket.repairNote }}</span>
          </div>

          <div v-if="ticket.stage === '待修'" class="repair-form">
            <input v-model="repairNotes[ticket.id]" placeholder="填写维修处理说明" />
            <button
              type="button"
              :disabled="!repairNotes[ticket.id]?.trim()"
              @click="store.markRepaired(ticket.id, repairNotes[ticket.id] ?? '')"
            >
              登记修复（待确认）
            </button>
          </div>
          <div v-else class="row-actions">
            <button type="button" @click="store.confirmRepair(ticket.id)">确认修复，恢复接单</button>
            <span class="hint">确认前该车位继续停用</span>
          </div>
        </article>
      </div>

      <div v-if="store.repairs.some((ticket) => ticket.confirmedAt)" class="history">
        <h3>已闭环工单</h3>
        <div v-for="ticket in store.repairs.filter((item) => item.confirmedAt)" :key="ticket.id" class="history-item">
          <span>{{ ticket.gunId }} / {{ ticket.stallId }}</span>
          <span class="muted">{{ formatTime(ticket.reportedAt) }} 报修 → {{ formatTime(ticket.confirmedAt) }} {{ ticket.confirmedBy }}确认恢复</span>
        </div>
      </div>
    </section>
  </div>
</template>
