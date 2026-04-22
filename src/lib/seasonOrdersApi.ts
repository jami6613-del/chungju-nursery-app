/** 시즌 작물 주문현황: 5개 화이트보드, 각 보드별 작물명 + 주문 항목들 */

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

const STORAGE_KEY = "season_orders_v1";

function loadData(): SeasonOrderData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { boards: {}, items: [] };
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
    return { boards: {}, items: [] };
  }
}

function saveData(data: SeasonOrderData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

export function fetchSeasonOrderData(): SeasonOrderData {
  return loadData();
}

export function setBoardCropName(boardIndex: number, cropName: string): void {
  const data = loadData();
  if (cropName.trim()) {
    data.boards[boardIndex] = cropName.trim();
  } else {
    delete data.boards[boardIndex];
  }
  saveData(data);
}

export function addSeasonOrderItem(
  boardIndex: number,
  orderer: string,
  variety: string,
  quantity: string,
  quantityUnit: "판" | "포기",
  contact: string,
): SeasonOrderItem {
  const data = loadData();
  const item: SeasonOrderItem = {
    id: crypto.randomUUID(),
    boardIndex,
    orderer: orderer.trim(),
    variety: variety.trim(),
    quantity: quantity.trim(),
    quantity_unit: quantityUnit === "포기" ? "포기" : "판",
    contact: normalizeKoreanMobile(contact.trim()),
    note: "",
    sold: false,
  };
  data.items.push(item);
  saveData(data);
  return item;
}

export function updateSeasonOrderItem(
  id: string,
  updates: Partial<Pick<SeasonOrderItem, "orderer" | "variety" | "quantity" | "quantity_unit" | "contact" | "note" | "sold">>,
): SeasonOrderItem | null {
  const data = loadData();
  const idx = data.items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const merged = { ...data.items[idx], ...updates } as SeasonOrderItem;
  const item: SeasonOrderItem = {
    ...merged,
    quantity_unit: merged.quantity_unit === "포기" ? "포기" : "판",
    contact: updates.contact != null ? normalizeKoreanMobile(String(updates.contact)) : merged.contact,
    orderer: typeof merged.orderer === "string" ? merged.orderer : "",
    variety: typeof merged.variety === "string" ? merged.variety : "",
    quantity: typeof merged.quantity === "string" ? merged.quantity : "",
    note: typeof merged.note === "string" ? merged.note : "",
    sold: merged.sold === true,
  };
  data.items[idx] = item;
  saveData(data);
  return item;
}

export function deleteSeasonOrderItem(id: string): boolean {
  const data = loadData();
  const before = data.items.length;
  data.items = data.items.filter((i) => i.id !== id);
  if (data.items.length === before) return false;
  saveData(data);
  return true;
}
