import { supabase } from "../supabaseClient";
import type { SowingPlanItem, UnprocessedOrder } from "../types";
import type { SeedOwner } from "../types";

const DEFAULT_SEED_OWNER: SeedOwner = "육묘장";

/** 새 컬럼(tray_type, tray_custom, seed_owner)이 테이블에 없을 때 true */
function isMissingNewColumnsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("schema cache") && m.includes("column")) ||
    (m.includes("could not find") && (m.includes("seed_owner") || m.includes("tray_type") || m.includes("tray_custom"))) ||
    (m.includes("column") && m.includes("does not exist"))
  );
}

function mapPlanRow(row: Record<string, unknown>): SowingPlanItem {
  const seed = row.seed_owner as string | undefined;
  return {
    id: row.id as string,
    plan_date: (row.plan_date as string).slice(0, 10),
    orderer: (row.orderer as string) ?? "",
    crop: (row.crop as string) ?? "",
    quantity: (row.quantity as string) ?? "",
    tray_type: (row.tray_type as string) ?? "",
    tray_custom: (row.tray_custom as string) ?? "",
    seed_owner: seed === "주문자" ? "주문자" : "육묘장",
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    source_unprocessed_id: (row.source_unprocessed_id as string) ?? null,
  };
}

function mapUnprocessedRow(row: Record<string, unknown>): UnprocessedOrder {
  return {
    id: row.id as string,
    content: row.content as string,
    created_by: row.created_by as string,
    created_by_email: (row.created_by_email as string) ?? null,
    created_by_role_level: row.created_by_role_level != null ? (row.created_by_role_level as number) : null,
    created_at: row.created_at as string,
    reflected_at: (row.reflected_at as string) ?? null,
    reflected_plan_date: row.reflected_plan_date
      ? (row.reflected_plan_date as string).slice(0, 10)
      : null,
    deleted_at: (row.deleted_at as string) ?? null,
  };
}

export async function fetchSowingPlanItems(
  dateFrom: string,
  dateTo: string,
): Promise<SowingPlanItem[]> {
  const { data } = await supabase
    .from("sowing_plan_items")
    .select("*")
    .gte("plan_date", dateFrom)
    .lte("plan_date", dateTo)
    .order("plan_date", { ascending: true })
    .order("created_at", { ascending: true });
  return ((data as Record<string, unknown>[]) ?? []).map(mapPlanRow);
}

export async function fetchUnprocessedOrders(): Promise<UnprocessedOrder[]> {
  const { data } = await supabase
    .from("unprocessed_orders")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data as Record<string, unknown>[]) ?? []).map(mapUnprocessedRow);
}

/** 파종계획 미반영 + 미삭제 게시글 개수 (메인메뉴 배지용) */
export async function fetchUnprocessedPendingCount(): Promise<number> {
  const { count, error } = await supabase
    .from("unprocessed_orders")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("reflected_at", null);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

export async function addSowingPlanItem(
  planDate: string,
  orderer: string,
  crop: string,
  quantity: string,
  createdBy: string,
  sourceUnprocessedId?: string,
  trayType: string = "",
  trayCustom: string = "",
  seedOwner: SeedOwner = DEFAULT_SEED_OWNER,
): Promise<SowingPlanItem | null> {
  const fullPayload: Record<string, unknown> = {
    plan_date: planDate,
    orderer: orderer.trim() || "",
    crop: crop.trim() || "",
    quantity: quantity.trim() || "",
    tray_type: trayType || "",
    tray_custom: trayCustom || "",
    seed_owner: seedOwner,
    created_by: createdBy,
    ...(sourceUnprocessedId && { source_unprocessed_id: sourceUnprocessedId }),
  };
  let result = await supabase
    .from("sowing_plan_items")
    .insert(fullPayload)
    .select()
    .single();
  if (result.error && isMissingNewColumnsError(result.error.message)) {
    const legacyPayload: Record<string, unknown> = {
      plan_date: planDate,
      orderer: orderer.trim() || "",
      crop: crop.trim() || "",
      quantity: quantity.trim() || "",
      created_by: createdBy,
      ...(sourceUnprocessedId && { source_unprocessed_id: sourceUnprocessedId }),
    };
    result = await supabase
      .from("sowing_plan_items")
      .insert(legacyPayload)
      .select()
      .single();
  }
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapPlanRow(result.data as Record<string, unknown>) : null;
}

export async function addUnprocessedOrder(
  content: string,
  createdBy: string,
  createdByEmail: string | null,
  createdByRoleLevel: number,
): Promise<UnprocessedOrder> {
  const { data, error } = await supabase
    .from("unprocessed_orders")
    .insert({
      content: content.trim(),
      created_by: createdBy,
      created_by_email: createdByEmail ?? null,
      created_by_role_level: createdByRoleLevel,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("등록 결과를 받지 못했습니다.");
  return mapUnprocessedRow(data as Record<string, unknown>);
}

export async function updateUnprocessedOrder(id: string, content: string): Promise<UnprocessedOrder> {
  const { data, error } = await supabase
    .from("unprocessed_orders")
    .update({ content: content.trim() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("수정 결과를 받지 못했습니다.");
  return mapUnprocessedRow(data as Record<string, unknown>);
}

/** 소프트 삭제: deleted_at만 설정하고 목록에는 삭제된 글로 표시 */
export async function deleteUnprocessedOrder(id: string): Promise<UnprocessedOrder> {
  const { data, error } = await supabase
    .from("unprocessed_orders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("삭제 결과를 받지 못했습니다.");
  return mapUnprocessedRow(data as Record<string, unknown>);
}

/** 삭제된 지 24시간 지난 게시글을 DB에서 완전 삭제 */
export async function deleteOldSoftDeletedUnprocessedOrders(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("unprocessed_orders")
    .delete()
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
  if (error) throw new Error(error.message);
}

export async function reflectUnprocessedToPlan(
  unprocessedId: string,
  planDate: string,
  createdBy: string,
  orderer: string,
  crop: string,
  quantity: string,
  trayType: string = "",
  trayCustom: string = "",
  seedOwner: SeedOwner = DEFAULT_SEED_OWNER,
): Promise<{ planItem: SowingPlanItem | null; ok: boolean }> {
  const planItem = await addSowingPlanItem(
    planDate,
    orderer.trim() || "",
    crop.trim() || "",
    quantity.trim() || "",
    createdBy,
    unprocessedId,
    trayType,
    trayCustom,
    seedOwner,
  );
  if (!planItem) return { planItem: null, ok: false };
  const { error } = await supabase
    .from("unprocessed_orders")
    .update({
      reflected_at: new Date().toISOString(),
      reflected_plan_date: planDate,
    })
    .eq("id", unprocessedId);
  return { planItem, ok: !error };
}

/** 반영 취소: 파종계획에서 제거하고 미처리 주문을 반영 전 상태로 복구 */
export async function unreflectUnprocessedOrder(
  unprocessedId: string,
): Promise<boolean> {
  const { error: delError } = await supabase
    .from("sowing_plan_items")
    .delete()
    .eq("source_unprocessed_id", unprocessedId);
  if (delError) throw new Error(delError.message);
  const { error: updError } = await supabase
    .from("unprocessed_orders")
    .update({ reflected_at: null, reflected_plan_date: null })
    .eq("id", unprocessedId);
  if (updError) throw new Error(updError.message);
  return true;
}

export async function updateSowingPlanItem(
  id: string,
  data: {
    orderer: string;
    crop: string;
    quantity: string;
    tray_type?: string;
    tray_custom?: string;
    seed_owner?: SeedOwner;
  },
): Promise<SowingPlanItem | null> {
  const fullPayload: Record<string, unknown> = {
    orderer: data.orderer.trim() || "",
    crop: data.crop.trim() || "",
    quantity: data.quantity.trim() || "",
  };
  if (data.tray_type !== undefined) fullPayload.tray_type = data.tray_type;
  if (data.tray_custom !== undefined) fullPayload.tray_custom = data.tray_custom;
  if (data.seed_owner !== undefined) fullPayload.seed_owner = data.seed_owner;

  let result = await supabase
    .from("sowing_plan_items")
    .update(fullPayload)
    .eq("id", id)
    .select()
    .single();
  if (result.error && isMissingNewColumnsError(result.error.message)) {
    const legacyPayload = {
      orderer: data.orderer.trim() || "",
      crop: data.crop.trim() || "",
      quantity: data.quantity.trim() || "",
    };
    result = await supabase
      .from("sowing_plan_items")
      .update(legacyPayload)
      .eq("id", id)
      .select()
      .single();
  }
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapPlanRow(result.data as Record<string, unknown>) : null;
}

/** 파종계획 삭제. source_unprocessed_id가 있으면 해당 미처리 주문도 반영 전 상태로 복구 */
export async function deleteSowingPlanItem(id: string): Promise<{
  ok: boolean;
  sourceUnprocessedId: string | null;
}> {
  const { data: existing } = await supabase
    .from("sowing_plan_items")
    .select("source_unprocessed_id")
    .eq("id", id)
    .single();
  const sourceId = (existing as { source_unprocessed_id: string | null } | null)
    ?.source_unprocessed_id ?? null;

  const { error: delError } = await supabase
    .from("sowing_plan_items")
    .delete()
    .eq("id", id);
  if (delError) throw new Error(delError.message);

  if (sourceId) {
    const { error: updError } = await supabase
      .from("unprocessed_orders")
      .update({ reflected_at: null, reflected_plan_date: null })
      .eq("id", sourceId);
    if (updError) throw new Error(updError.message);
  }
  return { ok: true, sourceUnprocessedId: sourceId };
}

/** plan_date가 beforeDate 이전인 파종계획 삭제. 연동된 미처리 주문은 반영 해제 */
export async function deleteOldSowingPlanItems(beforeDate: string): Promise<void> {
  const { data: oldItems } = await supabase
    .from("sowing_plan_items")
    .select("id, source_unprocessed_id")
    .lt("plan_date", beforeDate);
  const rows = (oldItems as { id: string; source_unprocessed_id: string | null }[]) ?? [];
  const sourceIds = rows.map((r) => r.source_unprocessed_id).filter((id): id is string => !!id);
  for (const id of sourceIds) {
    await supabase
      .from("unprocessed_orders")
      .update({ reflected_at: null, reflected_plan_date: null })
      .eq("id", id);
  }
  const { error } = await supabase
    .from("sowing_plan_items")
    .delete()
    .lt("plan_date", beforeDate);
  if (error) throw new Error(error.message);
}

/** 전체 일자별 파종 건수 (캘린더용) */
export async function fetchPlanCountsByDate(
  year: number,
  month: number,
): Promise<Record<string, number>> {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0);
  const lastStr = `${year}-${String(month).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  const { data } = await supabase
    .from("sowing_plan_items")
    .select("plan_date")
    .gte("plan_date", first)
    .lte("plan_date", lastStr);
  const rows = (data as { plan_date: string }[]) ?? [];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const d = r.plan_date.slice(0, 10);
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}
