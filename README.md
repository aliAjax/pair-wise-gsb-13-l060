# 加油站充电服务台账

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Element Plus、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`
- 冒烟测试：`node_modules/.bin/esbuild scripts/smoke.mjs --bundle --platform=node --format=esm --outfile=scripts/smoke.bundle.mjs && node scripts/smoke.bundle.mjs`

在原班次交接页基础上扩展的充电服务台账，数据保存在浏览器 localStorage，重开页面可接着处理。

## 业务规则

1. **进场绑定**：车辆进场登记车牌、充电枪号（自动关联车位，一一绑定）、车主预计回位时间与联系电话。
2. **候位卡点**：同一枪上前一单未确认拔枪并结清，或枪体报修未确认修复时，后车自动进入候位区，单据写明卡点原因；卡点解除后由候位区一键转入枪位。
3. **拔枪与结清**：充电中 → 现场确认拔枪（枪仍占用）→ 结清费用后枪/车位才释放。
4. **报修停用**：枪体报修后关联车位立即停用；登记修复只到“已修复待确认”，确认后才能恢复接单。
5. **交接班**：生成交接单时快照在场车辆、未结订单、待修设备；接班人须逐辆/逐项核对并签字确认，未确认前责任仍留在原班，页面顶部持续提示。
6. **本机保存**：全部状态（含候位单、未确认报修、未确认交接）按版本写入 localStorage，重开浏览器后继续处理。

## 分层结构

- `src/types.ts`：领域模型（订单、充电枪、车位、报修、交接）
- `src/services/seedData.ts`：订单与设备资料（初始数据）
- `src/services/occupancy.ts`：占用/停用判定（纯函数，独立于页面）
- `src/services/storage.ts`：本机保存（localStorage 读写与版本控制）
- `src/services/time.ts`：时间格式化
- `src/stores/ledger.ts`：Pinia 业务编排，动作后自动持久化
- `src/components/`：页面组件（ShiftBar / VehicleEntry / OrderBoard / DevicePanel / HandoverPanel）
