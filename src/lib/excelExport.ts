import type { Order } from "../types";
import ExcelJS from "exceljs";

const HEADERS = ["파종일", "주문자", "파종작물", "종자", "수량", "트레이", "출하일", "출하수량", "비고"];

function orderToRow(o: Order): (string | number | null)[] {
  const sowingDate = o.sowing_date ?? "";
  const shippingDate = o.shipping_date ?? "";
  const qty = `${o.quantity_base}+${o.quantity_extra}`;
  return [
    sowingDate,
    o.customer_name ?? "",
    o.crop_name ?? "",
    o.seed_owner ?? "",
    qty,
    o.tray_type ?? "",
    shippingDate,
    o.shipping_quantity ?? "",
    o.note ?? "",
  ];
}

/** 연도에 해당하는 주문 목록으로 엑셀 Blob 생성 (헤더 행 배경색 적용) */
export async function createOrdersExcelBlob(
  orders: Order[],
  year: number
): Promise<Blob> {
  const rows = orders.filter((o) => (o.sowing_date ?? "").startsWith(String(year)));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`파종출하현황_${year}년`, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.addRow(HEADERS);
  rows
    .sort((a, b) => (b.sowing_date ?? "").localeCompare(a.sowing_date ?? ""))
    .forEach((o) => ws.addRow(orderToRow(o)));

  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8E0EC" },
    };
    cell.font = { bold: true };
  });

  ws.columns.forEach((col, i) => {
    col.width = i === 2 ? 18 : i === 8 ? 24 : 14;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
