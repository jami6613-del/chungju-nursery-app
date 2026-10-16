import type { AppUser, Order } from '../types';

export interface StatementProvider {
  name: string; department: string; registration: string; representative: string;
  address: string; business: string; category: string; bank: string; account: string;
  accountHolder: string; phone: string; fax: string; stamp: string;
}
export interface StatementLine {
  id: string; sourceId?: string; crop: string; quantity: string; tray: string;
  unitPrice: string; amountOverride: string; shippingDate: string; note: string;
}
export interface StatementDraft {
  customerName: string; address: string; contact: string;
  dateFrom: string; dateTo: string; tradeDate: string;
  lines: StatementLine[]; deposit: string; note: string;
}
export interface StatementSnapshot extends StatementDraft {
  version: 1; documentNumber: string; provider: StatementProvider;
}
export interface StatementRecord {
  id: string; document_number: string; customer_name: string; trade_date: string;
  total_amount: number; deposit_amount: number; created_at: string; created_by: string;
  payload: StatementSnapshot;
}
export type StatementSummary = Omit<StatementRecord, 'payload'>;
export const MAX_STATEMENT_ROWS = 120;
export const MAX_STATEMENT_AMOUNT = 999_999_999_999;
export function canUseStatements(user: AppUser | null): boolean {
  return !!user?.is_approved && (user.role_level === 0 || user.role_level === 1);
}
export function seoulToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function blankStatementLine(): StatementLine {
  return { id: crypto.randomUUID(), crop: '', quantity: '', tray: '', unitPrice: '', amountOverride: '', shippingDate: '', note: '' };
}
export function blankStatement(): StatementDraft {
  const today = seoulToday();
  return { customerName: '', address: '', contact: '', dateFrom: `${today.slice(0, 7)}-01`, dateTo: today, tradeDate: today, lines: [blankStatementLine()], deposit: '', note: '' };
}
export function numberValue(value: string): number | null {
  const text = value.replaceAll(',', '').trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n <= MAX_STATEMENT_AMOUNT ? n : null;
}
export function lineAmount(line: StatementLine): number | null {
  if (line.amountOverride.trim()) {
    const amount = numberValue(line.amountOverride);
    return amount !== null && Number.isInteger(amount) ? amount : null;
  }
  const q = numberValue(line.quantity), p = numberValue(line.unitPrice);
  if (q === null || p === null || !Number.isInteger(p)) return null;
  // Exact decimal arithmetic: e.g. 1.005 × 100 is 101 won, not 100 from binary rounding.
  const [whole, fraction=''] = line.quantity.replaceAll(',', '').trim().split('.');
  const divisor = 10n ** BigInt(fraction.length);
  const scaled = BigInt((whole || '0') + fraction) * BigInt(p);
  const amount = Number((scaled + divisor / 2n) / divisor);
  return amount <= MAX_STATEMENT_AMOUNT ? amount : null;
}
export function isUsedLine(line: StatementLine): boolean {
  return [line.crop,line.quantity,line.tray,line.unitPrice,line.amountOverride,line.shippingDate,line.note].some(v => !!v.trim());
}
export function statementTotal(lines: StatementLine[]): number {
  return lines.reduce((sum, line) => sum + (lineAmount(line) ?? 0), 0);
}
export function money(n: number): string { return n.toLocaleString('ko-KR'); }
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function validateStatement(draft: StatementDraft): string | null {
  if (!draft.customerName.trim()) return '주문자 이름을 입력해 주세요.';
  if (draft.customerName.length > 80 || draft.address.length > 120 || draft.contact.length > 40 || draft.note.length > 80) return '주문자 정보 또는 비고가 너무 깁니다.';
  if (!isValidDate(draft.tradeDate)) return '거래일을 확인해 주세요.';
  if ((draft.dateFrom && !isValidDate(draft.dateFrom)) || (draft.dateTo && !isValidDate(draft.dateTo)) || (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo)) return '거래기간을 확인해 주세요.';
  const lines = draft.lines.filter(isUsedLine);
  if (!lines.length) return '거래내역을 한 줄 이상 입력해 주세요.';
  if (lines.length > MAX_STATEMENT_ROWS) return `한 번에 ${MAX_STATEMENT_ROWS}줄까지 발급할 수 있습니다. 기간을 나누어 주세요.`;
  for (const [i,line] of lines.entries()) {
    if (!line.crop.trim() && !line.note.trim()) return `${i+1}번째 줄에 작물명 또는 비고를 입력해 주세요.`;
    if (line.crop.length > 80 || line.note.length > 80 || line.tray.length > 40 || line.quantity.length > 40 || line.unitPrice.length > 40) return `${i+1}번째 줄의 내용이 너무 깁니다. 작물명·비고는 80자, 나머지는 40자 이내로 적어 주세요.`;
    if (line.shippingDate && !isValidDate(line.shippingDate)) return `${i+1}번째 줄의 출하일을 확인해 주세요.`;
    if (lineAmount(line) === null) return `${i+1}번째 줄의 수량·단가를 입력하거나 금액을 직접 입력해 주세요. 금액·단가는 원 단위로 입력합니다.`;
  }
  const total = statementTotal(lines);
  if (total > MAX_STATEMENT_AMOUNT) return '총 금액이 입력 가능 범위를 초과했습니다.';
  const deposit = numberValue(draft.deposit || '0');
  if (deposit === null || !Number.isInteger(deposit) || deposit > total) return '계약금은 0원부터 총 금액까지 원 단위로 입력해 주세요.';
  return null;
}
export function makeSnapshot(draft: StatementDraft, id: string, provider: StatementProvider): StatementSnapshot {
  const error = validateStatement(draft);
  if (error) throw new Error(error);
  return {
    ...structuredClone(draft), customerName: draft.customerName.trim(),
    lines: draft.lines.filter(isUsedLine).map(line => ({...line})), deposit: draft.deposit || '0',
    version: 1, documentNumber: `TM-${draft.tradeDate.replaceAll('-','')}-${id.slice(0,8).toUpperCase()}`,
    provider: {...provider},
  };
}
export function orderToStatementLine(order: Order): StatementLine {
  const tray = order.tray_type || '';
  return {
    id: crypto.randomUUID(), sourceId: order.id, crop: order.crop_name,
    quantity: String(order.shipping_quantity ?? order.quantity_base),
    tray: /^\d+$/.test(tray) ? `${tray}구` : tray,
    unitPrice: '', amountOverride: '', shippingDate: order.shipping_date || '', note: order.note || '',
  };
}
export function appendOrders(lines: StatementLine[], orders: Order[]): StatementLine[] {
  const used = lines.filter(isUsedLine);
  const seen = new Set(used.map(line => line.sourceId).filter(Boolean));
  for (const order of orders) if (!seen.has(order.id)) { used.push(orderToStatementLine(order)); seen.add(order.id); }
  if (used.length > MAX_STATEMENT_ROWS) throw new Error(`최대 ${MAX_STATEMENT_ROWS}줄까지 추가할 수 있습니다.`);
  return used.length ? used : [blankStatementLine()];
}
