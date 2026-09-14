/** 화이트보드와 워치에서 공유하는 파종계획 표시·합산 기준. */
export interface PlanSummaryItem {
  orderer: string;
  crop: string;
  quantity: string;
  tray_type: string;
  tray_custom: string;
  seed_owner: string;
}
export type PlanTrayItem = Pick<PlanSummaryItem, "quantity" | "tray_type" | "tray_custom">;

export function planQuantityParse(quantity: string): { base: string; extra: string } {
  const i = quantity.indexOf("+");
  if (i >= 0)
    return { base: quantity.slice(0, i).trim(), extra: quantity.slice(i + 1).trim() };
  return { base: quantity.trim(), extra: "" };
}

/** 기존 화이트보드 기준 유지: 기본/추가 각각 정수 부분을 합산한다. */
export function planQuantityToTotal(quantity: string): number {
  const { base, extra } = planQuantityParse(quantity || "");
  return (parseInt(base, 10) || 0) + (parseInt(extra, 10) || 0);
}

export function planTrayKey(item: Pick<PlanSummaryItem, "tray_type" | "tray_custom">): string {
  return (item.tray_type === "직접입력" ? (item.tray_custom || "").trim() : (item.tray_type || "").trim()) || "미지정";
}

export function summarizePlanTrays(items: PlanTrayItem[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = planTrayKey(item);
    totals.set(key, (totals.get(key) || 0) + planQuantityToTotal(item.quantity || ""));
  }
  return [...totals.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface WatchSowingData {
  today_date: string;
  tomorrow_date: string;
  generated_at: string;
  today_items: PlanSummaryItem[];
  tomorrow_items: PlanTrayItem[];
}

const oneLine = (value: string, fallback: string) => value.replace(/\s+/g, " ").trim() || fallback;
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const trayLabel = (tray: string) => /^\d+$/.test(tray) ? `${tray}구` : oneLine(tray, "미지정");

export function formatWatchSowingSummary(data: WatchSowingData): string {
  const lines = [`🌱 오늘 파종 ${shortDate(data.today_date)} · ${data.today_items.length}건`];
  if (!data.today_items.length) lines.push("예정된 파종 없음");
  for (const item of data.today_items) {
    const { base, extra } = planQuantityParse(item.quantity || "");
    lines.push(
      "",
      `${oneLine(item.orderer, "주문자 미입력")} · ${oneLine(item.crop, "작물 미입력")}`,
      `종자 ${oneLine(item.seed_owner, "육묘장")} · ${trayLabel(planTrayKey(item))}`,
      `수량 ${oneLine(base, "-")}+${oneLine(extra, "0")} (기본+추가)`,
    );
  }
  lines.push("", `📦 내일 트레이 ${shortDate(data.tomorrow_date)}`);
  const totals = summarizePlanTrays(data.tomorrow_items);
  if (!data.tomorrow_items.length) lines.push("파종계획 없음");
  else if (!totals.length) lines.push("합산할 수량 없음 · 화이트보드 확인");
  else totals.forEach(([tray, count]) => lines.push(`${trayLabel(tray)} ${count.toLocaleString("ko-KR")}개`));
  const queriedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(data.generated_at));
  lines.push("", `조회 ${queriedAt} · 한국시간`);
  return lines.join("\n");
}

/** 통신/배포 오류를 '파종 없음'으로 표시하지 않도록 응답 형식을 검사한다. */
export function isWatchSowingData(value: unknown): value is WatchSowingData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  const isItems = (items: unknown, keys: string[]) => Array.isArray(items) && items.every(item =>
    item && keys.every(key => typeof item[key] === "string"));
  return isDate(data.today_date) && isDate(data.tomorrow_date) &&
    Date.parse(data.tomorrow_date) - Date.parse(data.today_date) === 86400000 &&
    typeof data.generated_at === "string" && Number.isFinite(Date.parse(data.generated_at)) &&
    isItems(data.today_items, ["orderer", "crop", "quantity", "tray_type", "tray_custom", "seed_owner"]) &&
    isItems(data.tomorrow_items, ["quantity", "tray_type", "tray_custom"]);
}
