<script setup lang="ts">
import { reactive } from "vue";
import { ElMessage } from "element-plus";
import { useLedgerStore } from "../stores/ledger";
import type { ChargingGun, RepairRecord } from "../types";
import { formatTime } from "../services/time";

const store = useLedgerStore();

const reportForms = reactive<Record<string, string>>({});
const fixForms = reactive<Record<string, string>>({});
const showingReport = reactive<Record<string, boolean>>({});

function openRepairOf(gunId: string): RepairRecord | undefined {
  return store.repairs.find((repair) => repair.gunId === gunId && repair.status !== "confirmed");
}

function activeOrderOf(gunId: string) {
  return store.gunStatus(gunId).active;
}

function spotOf(gun: ChargingGun) {
  return store.spots.find((spot) => spot.id === gun.spotId)?.name ?? gun.spotId;
}

function doReport(gun: ChargingGun) {
  const fault = (reportForms[gun.id] ?? "").trim();
  if (!fault) {
    ElMessage.warning("请填写故障现象再报修。");
    return;
  }
  const result = store.reportRepair({ gunId: gun.id, fault });
  if (result.ok) {
    ElMessage.success(result.message);
    reportForms[gun.id] = "";
    showingReport[gun.id] = false;
  } else {
    ElMessage.error(result.message);
  }
}

function doFix(repair: RepairRecord) {
  const note = (fixForms[repair.id] ?? "").trim();
  if (!note) {
    ElMessage.warning("请填写修复说明。");
    return;
  }
  const result = store.fixRepair(repair.id, note);
  result.ok ? ElMessage.success(result.message) : ElMessage.error(result.message);
}

function doConfirm(repair: RepairRecord) {
  const result = store.confirmRepair(repair.id);
  result.ok ? ElMessage.success(result.message) : ElMessage.error(result.message);
}

const recentClosed = () =>
  store.repairs.filter((repair) => repair.status === "confirmed").slice(0, 5);
</script>

<template>
  <section class="panel device-panel">
    <div class="toolbar">
      <h2>充电枪 / 车位设备</h2>
      <span class="panel-hint">报修后关联车位立即停用，修复确认后恢复接单</span>
    </div>

    <div class="gun-grid">
      <article
        v-for="gun in store.guns"
        :key="gun.id"
        class="gun-card"
        :class="openRepairOf(gun.id) ? 'gun-disabled' : activeOrderOf(gun.id) ? 'gun-busy' : 'gun-idle'"
      >
        <header class="gun-head">
          <div>
            <strong>{{ gun.name }}</strong>
            <span class="gun-power">{{ gun.powerKw }}kW · {{ spotOf(gun) }}</span>
          </div>
          <span class="gun-badge">
            <template v-if="openRepairOf(gun.id)">停用</template>
            <template v-else-if="activeOrderOf(gun.id)">占用</template>
            <template v-else>可接单</template>
          </span>
        </header>

        <!-- 在用情况 -->
        <p v-if="activeOrderOf(gun.id)" class="gun-line busy-line">
          在场车辆：{{ activeOrderOf(gun.id)!.plate }}（{{ activeOrderOf(gun.id)!.status === "unplugged" ? "已拔枪待结清" : "充电中" }}）
        </p>

        <!-- 报修流程 -->
        <template v-if="openRepairOf(gun.id)">
          <div v-if="openRepairOf(gun.id)!.status === 'reported'" class="repair-flow">
            <p class="gun-line fault-line">故障：{{ openRepairOf(gun.id)!.fault }}</p>
            <p class="gun-line muted-line">
              {{ openRepairOf(gun.id)!.reporter }} 于 {{ formatTime(openRepairOf(gun.id)!.reportedAt) }} 报修，
              {{ spotOf(gun) }}已停用
            </p>
            <textarea
              v-model="fixForms[openRepairOf(gun.id)!.id]"
              placeholder="登记修复说明（更换配件、测试结果）"
            />
            <button type="button" @click="doFix(openRepairOf(gun.id)!)">登记修复（待确认）</button>
          </div>
          <div v-else class="repair-flow">
            <p class="gun-line fixed-line">修复：{{ openRepairOf(gun.id)!.fixNote }}</p>
            <p class="gun-line muted-line">
              {{ openRepairOf(gun.id)!.fixer }} 于 {{ formatTime(openRepairOf(gun.id)!.fixedAt) }} 登记修复，
              <strong>未确认前不能恢复接单</strong>
            </p>
            <button type="button" @click="doConfirm(openRepairOf(gun.id)!)">确认修复，恢复接单</button>
          </div>
        </template>

        <!-- 正常枪可报修 -->
        <template v-else>
          <div v-if="showingReport[gun.id]" class="repair-flow">
            <textarea v-model="reportForms[gun.id]" placeholder="填写故障现象，报修后关联车位立即停用" />
            <div class="actions">
              <button type="button" @click="doReport(gun)">确认报修</button>
              <button class="secondary" type="button" @click="showingReport[gun.id] = false">取消</button>
            </div>
          </div>
          <button v-else class="secondary" type="button" @click="showingReport[gun.id] = true">枪体报修</button>
        </template>
      </article>
    </div>

    <details v-if="recentClosed().length" class="history">
      <summary>已确认修复记录（{{ recentClosed().length }}）</summary>
      <ul class="repair-history">
        <li v-for="repair in recentClosed()" :key="repair.id">
          {{ store.guns.find((gun) => gun.id === repair.gunId)?.name }}：{{ repair.fault }} ——
          {{ repair.fixNote }}（{{ repair.confirmer }} 确认于 {{ formatTime(repair.confirmedAt) }}）
        </li>
      </ul>
    </details>
  </section>
</template>
