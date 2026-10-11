import type { Order, SowingPlanItem } from "../types";

export function getKoreaPlanDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function normalizeOrderer(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

/** 과거 현황에는 계획 ID가 없으므로 동일 내역을 한 건씩만 대응시킨다. */
export function getPendingPlans(plans: SowingPlanItem[], orders: Order[], today: string): SowingPlanItem[] {
  const linked = new Set(orders.map((order) => order.source_sowing_plan_id).filter(Boolean));
  const legacy = orders.filter((order) => !order.source_sowing_plan_id).slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sorted = plans.filter((plan) => plan.plan_date >= today).slice()
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return sorted.filter((plan) => {
    if (linked.has(plan.id)) return false;
    const [base, extra = ""] = (plan.quantity || "").split("+");
    const quantityBase = parseFloat(base.replace(",", ".")) || 0;
    const quantityExtra = parseFloat(extra.replace(",", ".")) || 0;
    const tray = (plan.tray_type === "직접입력" ? plan.tray_custom : plan.tray_type).trim() || "200";
    const index = legacy.findIndex((order) =>
      order.sowing_date === plan.plan_date &&
      order.customer_name.trim() === plan.orderer.trim() &&
      order.crop_name.trim() === plan.crop.trim() &&
      order.seed_owner === plan.seed_owner && order.tray_type.trim() === tray &&
      Number(order.quantity_base) === quantityBase && Number(order.quantity_extra) === quantityExtra &&
      order.created_at >= plan.created_at,
    );
    if (index < 0) return true;
    legacy.splice(index, 1);
    return false;
  });
}

export function searchPendingPlans(plans: SowingPlanItem[], name: string): SowingPlanItem[] {
  const query = normalizeOrderer(name);
  return query ? plans.filter((plan) => normalizeOrderer(plan.orderer).includes(query)) : [];
}
