// 时间展示工具，统一台账里的日期格式
export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO 时间 -> "09-26 21:05" */
export function formatTime(isoText: string | null): string {
  if (!isoText) return "—";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local 输入值 -> ISO */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** 相对超时提示：预计回位时间是否已过 */
export function overdueText(isoText: string, nowMs = Date.now()): string {
  const diff = new Date(isoText).getTime() - nowMs;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return diff >= 0 ? "马上到点" : "刚过点";
  if (mins < 60) return diff >= 0 ? `约${mins}分钟后回位` : `已超时${mins}分钟`;
  const hours = Math.round(mins / 60);
  return diff >= 0 ? `约${hours}小时后回位` : `已超时${hours}小时`;
}
