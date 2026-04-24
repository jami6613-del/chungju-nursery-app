/** 시즌 작물 주문현황: 5개 화이트보드, 각 보드별 작물명 + 주문 항목들 (Supabase 공용 저장) */

import { supabase } from "../supabaseClient";

export interface SeasonOrderItem {
  id: string;
  boardIndex: number;
  orderer: string;
  variety: string;
  quantity: string;
  quantity_unit: "판" | "포기";
  contact: string;
  note: string;
  sold: boolean;
}

export interface SeasonOrderData {
  boards: Record<number, string>; // boardIndex -> crop name
  items: SeasonOrderItem[];
}

const LEGACY_STORAGE_KEY = "season_orders_v1";
const MIGRATED_FLAG_KEY = "season_orders_v1_migrated_to_supabase";

function mapItem(row: Record<string, unknown>): SeasonOrderItem {
  const unit = row.quantity_unit === "포기" ? "포기" : "판";
  return {
    id: row.id as string,
    boardIndex: row.board_index as number,
    orderer: (row.orderer as string) ?? "",
    variety: (row.variety as string) ?? "",
    quantity: row.quantity != null ? String(row.quantity) : "",
    quantity_unit: unit,
    contact: (row.contact as string) ?? "",
    note: (row.note as string) ?? "",
    sold: row.sold === true,
  };
}

function normalizeKoreanMobile(contact: string): string {
  const digits = String(contact || "").replace(/\D/g, "");
  if (!digits) return "";

  // 8자리만 입력하면 010을 붙여서 처리 (12345678 / 1234-5678)
  const full = digits.length === 8 ? `010${digits}` : digits;

  if (full.length >= 11) return `${full.slice(0, 3)}-${full.slice(3, 7)}-${full.slice(7, 11)}`;
  if (full.length >= 7) return `${full.slice(0, 3)}-${full.slice(3, 7)}-${full.slice(7)}`;
  if (full.length >= 4) return `${full.slice(0, 3)}-${full.slice(3)}`;
  return full;
}

function readLegacyLocalData(): SeasonOrderData | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const boards: Record<number, string> = {};
    if (parsed.boards && typeof parsed.boards === "object") {
      for (const [k, v] of Object.entries(parsed.boards)) {
        const idx = parseInt(k, 10);
        if (!Number.isNaN(idx) && typeof v === "string") boards[idx] = v;
      }
    }
    const items: SeasonOrderItem[] = [];
    if (Array.isArray(parsed.items)) {
      for (const it of parsed.items) {
        if (it && typeof it === "object" && typeof it.id === "string" && typeof it.boardIndex === "number") {
          items.push({
            id: it.id,
            boardIndex: it.boardIndex,
            orderer: typeof it.orderer === "string" ? it.orderer : "",
            variety: typeof it.variety === "string" ? it.variety : "",
            quantity: typeof it.quantity === "string" ? it.quantity : "",
            quantity_unit: (it as { quantity_unit?: unknown }).quantity_unit === "포기" ? "포기" : "판",
            contact: typeof it.contact === "string" ? it.contact : "",
            note: typeof it.note === "string" ? it.note : "",
            sold: (it as { sold?: unknown }).sold === true,
          });
        }
      }
    }
    return { boards, items };
  } catch {
    return null;
  }
}

export function getLegacySeasonOrdersLocalSnapshot(): { hasLegacy: boolean; itemsCount: number; boardsCount: number } {
  const legacy = readLegacyLocalData();
  return {
    hasLegacy: !!legacy,
    itemsCount: legacy?.items.length ?? 0,
    boardsCount: legacy ? Object.keys(legacy.boards).length : 0,
  };
}

export async function migrateLegacyLocalToSupabase(
  userId?: string,
  opts?: { force?: boolean },
): Promise<{ migrated: boolean; reason?: string }> {
  try {
    // 플래그가 켜져 있어도, 서버가 비어있으면(0건이면) 재이관을 허용해야 데이터 유실처럼 보이지 않음
    const flagged = localStorage.getItem(MIGRATED_FLAG_KEY) === "1";
    const legacy = readLegacyLocalData();
    if (!legacy || (legacy.items.length === 0 && Object.keys(legacy.boards).length === 0))
      return { migrated: false, reason: "로컬 데이터 없음" };

    // 이미 Supabase에 데이터가 있으면(다른 사람이 먼저 올렸으면) 이관하지 않음
    const { count } = await supabase
      .from("season_orders_items")
      .select("*", { count: "exact", head: true });
    const serverCount = count ?? 0;
    if (!opts?.force && serverCount > 0) {
      localStorage.setItem(MIGRATED_FLAG_KEY, "1");
      return { migrated: false, reason: "서버에 이미 데이터 존재" };
    }
    if (!opts?.force && flagged && serverCount === 0) {
      // 서버가 비어있는데 플래그만 켜져있는 케이스(업그레이드 과정에서 흔함): 재이관 진행
      localStorage.removeItem(MIGRATED_FLAG_KEY);
    }

    // boards 업서트
    const boardRows = Array.from({ length: 5 }, (_, i) => ({
      board_index: i,
      crop_name: (legacy.boards[i] ?? "").trim(),
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    }));
    const { error: boardErr } = await supabase.from("season_orders_boards").upsert(boardRows, { onConflict: "board_index" });
    if (boardErr) throw new Error(boardErr.message);

    // items insert (기존 id 유지)
    const itemRows = legacy.items.map((it) => ({
      id: it.id,
      board_index: it.boardIndex,
      orderer: (it.orderer || "").trim(),
      variety: (it.variety || "").trim(),
      quantity: Number(String(it.quantity || "0").replace(",", ".")) || 0,
      quantity_unit: it.quantity_unit === "포기" ? "포기" : "판",
      contact: normalizeKoreanMobile(it.contact || ""),
      note: String(it.note || ""),
      sold: it.sold === true,
      created_by: userId ?? null,
      updated_by: userId ?? null,
      updated_at: new Date().toISOString(),
    }));
    if (itemRows.length > 0) {
      const { error: itemErr } = await supabase.from("season_orders_items").insert(itemRows);
      if (itemErr) throw new Error(itemErr.message);
    }

    localStorage.setItem(MIGRATED_FLAG_KEY, "1");
    return { migrated: true };
  } catch {
    return { migrated: false, reason: "이관 중 오류" };
  }
}

export async function fetchSeasonOrderData(): Promise<SeasonOrderData> {
  const { data: boardsData } = await supabase
    .from("season_orders_boards")
    .select("board_index,crop_name");
  const boards: Record<number, string> = {};
  for (const row of (boardsData as { board_index: number; crop_name: string }[]) ?? []) {
    boards[row.board_index] = row.crop_name ?? "";
  }

  const { data: itemsData } = await supabase
    .from("season_orders_items")
    .select("*")
    .order("created_at", { ascending: true });
  const items = ((itemsData as Record<string, unknown>[]) ?? []).map(mapItem);
  return { boards, items };
}

export async function setBoardCropName(
  boardIndex: number,
  cropName: string,
  userId?: string,
): Promise<void> {
  await supabase
    .from("season_orders_boards")
    .upsert(
      {
        board_index: boardIndex,
        crop_name: cropName.trim(),
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      },
      { onConflict: "board_index" },
    );
}

export async function addSeasonOrderItem(
  boardIndex: number,
  orderer: string,
  variety: string,
  quantity: string,
  quantityUnit: "판" | "포기",
  contact: string,
  userId?: string,
): Promise<SeasonOrderItem> {
  const payload = {
    board_index: boardIndex,
    orderer: orderer.trim(),
    variety: variety.trim(),
    quantity: Number(String(quantity || "0").replace(",", ".")) || 0,
    quantity_unit: quantityUnit === "포기" ? "포기" : "판",
    contact: normalizeKoreanMobile(contact.trim()),
    note: "",
    sold: false,
    created_by: userId ?? null,
    updated_by: userId ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data } = await supabase.from("season_orders_items").insert(payload).select().single();
  return mapItem((data as Record<string, unknown>) ?? payload);
}

export async function updateSeasonOrderItem(
  id: string,
  updates: Partial<Pick<SeasonOrderItem, "orderer" | "variety" | "quantity" | "quantity_unit" | "contact" | "note" | "sold">>,
  userId?: string,
): Promise<SeasonOrderItem | null> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };
  if (updates.orderer != null) payload.orderer = String(updates.orderer);
  if (updates.variety != null) payload.variety = String(updates.variety);
  if (updates.quantity != null) payload.quantity = Number(String(updates.quantity).replace(",", ".")) || 0;
  if (updates.quantity_unit != null) payload.quantity_unit = updates.quantity_unit === "포기" ? "포기" : "판";
  if (updates.contact != null) payload.contact = normalizeKoreanMobile(String(updates.contact));
  if (updates.note != null) payload.note = String(updates.note);
  if (updates.sold != null) payload.sold = updates.sold === true;

  const { data } = await supabase.from("season_orders_items").update(payload).eq("id", id).select().single();
  if (!data) return null;
  return mapItem(data as Record<string, unknown>);
}

export async function deleteSeasonOrderItem(id: string): Promise<boolean> {
  const { error } = await supabase.from("season_orders_items").delete().eq("id", id);
  return !error;
}
