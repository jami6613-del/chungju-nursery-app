/** 시즌 작물 주문현황: 5개 화이트보드, 각 보드별 작물명 + 주문 항목들 */

export interface SeasonOrderItem {
  id: string;
  boardIndex: number;
  orderer: string;
  variety: string;
  quantity: string;
  contact: string;
  note: string;
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
            contact: typeof it.contact === "string" ? it.contact : "",
            note: typeof it.note === "string" ? it.note : "",
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
  contact: string,
  note: string,
): SeasonOrderItem {
  const data = loadData();
  const item: SeasonOrderItem = {
    id: crypto.randomUUID(),
    boardIndex,
    orderer: orderer.trim(),
    variety: variety.trim(),
    quantity: quantity.trim(),
    contact: contact.trim(),
    note: note.trim(),
  };
  data.items.push(item);
  saveData(data);
  return item;
}

export function updateSeasonOrderItem(
  id: string,
  updates: Partial<Pick<SeasonOrderItem, "orderer" | "variety" | "quantity" | "contact" | "note">>,
): SeasonOrderItem | null {
  const data = loadData();
  const idx = data.items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const item = { ...data.items[idx], ...updates };
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
