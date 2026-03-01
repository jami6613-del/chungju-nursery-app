import type { Order } from "../types";
import { jsPDF } from "jspdf";

const A4_W = 210;
const A4_H = 297;
const MARGIN = 18;
const LINE_H = 6;

export interface CertificateInput {
  customerName: string;
  address: string;
  birthId: string; // YYYYMMDD-0******
  contact: string;
  cropName: string | null; // null = 선택하지 않음
  issueDate: string; // YYYY-MM-DD
}

export interface CertificateRow {
  품목: string;
  "트레이(구)": string;
  수량: string;
  파종일: string;
  출하일: string;
}

/** 필터된 주문을 인증서 행으로 변환 */
export function ordersToRows(orders: Order[]): CertificateRow[] {
  return orders.map((o) => {
    const tray = o.tray_type ?? "";
    const trayFormatted = /^\d+$/.test(tray) ? `${tray}구` : tray;
    return {
      품목: o.crop_name ?? "",
      "트레이(구)": trayFormatted,
      수량: String(o.quantity_base ?? 0),
      파종일: o.sowing_date ?? "",
      출하일: o.shipping_date ?? "",
    };
  });
}

/** 친환경육묘내역서 PDF 생성 (A4, 수정불가) */
export async function createCertificatePdf(
  input: CertificateInput,
  rows: CertificateRow[],
  stampDataUrl: string
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const setFont = (size: number, style: "normal" | "bold" = "normal") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
  };

  const drawText = (text: string, x: number, size = 10) => {
    setFont(size);
    doc.text(text, x, y);
    y += LINE_H;
  };

  const headerFill = [255, 253, 230] as [number, number, number]; // 연한 노랑

  // 제목
  setFont(22, "bold");
  doc.text("친환경육묘내역서", A4_W / 2, y, { align: "center" });
  y += LINE_H * 2;

  // 1. 고객정보
  setFont(12, "bold");
  doc.text("1. 고객정보", MARGIN, y);
  y += LINE_H;
  const infoData = [
    ["성명", input.customerName],
    ["주소", input.address],
    ["주민번호", input.birthId],
    ["연락처", input.contact],
  ];
  doc.setFillColor(...headerFill);
  infoData.forEach(([label, value]) => {
    doc.rect(MARGIN, y - 5, 35, 8, "F");
    doc.setDrawColor(0);
    doc.rect(MARGIN, y - 5, 35, 8);
    doc.rect(MARGIN + 35, y - 5, A4_W - MARGIN * 2 - 35, 8);
    setFont(10);
    doc.text(label, MARGIN + 3, y + 1);
    doc.text(value, MARGIN + 38, y + 1);
    y += 8;
  });
  y += LINE_H;

  // 2. 육묘 일반현황
  setFont(12, "bold");
  doc.text("2. 육묘 일반현황", MARGIN, y);
  y += LINE_H;
  const tableHeaders = ["품 목", "트레이(구)", "수량", "파종일", "출하일"];
  const colWidths = [50, 30, 25, 40, 40];
  const pageBottom = A4_H - MARGIN - 80;

  let tableY = y;
  const rowsCopy = rows.length ? [...rows] : [];
  const headerHeight = 14;
  const rowHeight = 7;

  if (rowsCopy.length === 0) {
    doc.setFillColor(...headerFill);
    doc.setDrawColor(0);
    let cx0 = MARGIN;
    tableHeaders.forEach((h, i) => {
      doc.rect(cx0, tableY - 5, colWidths[i], headerHeight);
      setFont(9, "bold");
      doc.text(h, cx0 + colWidths[i] / 2, tableY + 3, { align: "center" });
      cx0 += colWidths[i];
    });
    tableY += headerHeight;
    y = tableY + LINE_H;
  }

  while (rowsCopy.length > 0) {
    const remainingHeight = pageBottom - tableY;
    const maxRows = Math.floor((remainingHeight - headerHeight) / rowHeight);

    if (maxRows <= 0) {
      doc.addPage();
      tableY = MARGIN;
      continue;
    }

    const pageRows = rowsCopy.splice(0, maxRows);
    let cx = MARGIN;

    doc.setFillColor(...headerFill);
    doc.rect(cx, tableY - 5, colWidths.reduce((a, b) => a + b, 0), headerHeight, "FD");
    doc.setDrawColor(0);
    tableHeaders.forEach((h, i) => {
      doc.rect(cx, tableY - 5, colWidths[i], headerHeight);
      setFont(9, "bold");
      doc.text(h, cx + colWidths[i] / 2, tableY + 3, { align: "center" });
      cx += colWidths[i];
    });
    tableY += headerHeight;

    pageRows.forEach((row) => {
      cx = MARGIN;
      const vals = [row.품목, row["트레이(구)"], row.수량, row.파종일, row.출하일];
      vals.forEach((v, i) => {
        doc.rect(cx, tableY - 5, colWidths[i], rowHeight);
        setFont(8);
        doc.text(String(v).slice(0, 15), cx + 2, tableY + 1);
        cx += colWidths[i];
      });
      tableY += rowHeight;
    });
    y = tableY + LINE_H;
  }

  if (y > A4_H - MARGIN - 90) {
    doc.addPage();
    y = MARGIN;
  }

  // 3. 육묘 재배내역 (고정)
  setFont(12, "bold");
  doc.text("3. 육묘 재배내역", MARGIN, y);
  y += LINE_H;
  const cultData = [
    ["구분", "재배내역", "비고"],
    ["상토제조", "부농(주) - 부농 원예용상토(유기농)", "공시-3-2-068"],
    ["병해방제", "나라바이오(주) - 모두싹", "공시-3-6-016"],
  ];
  const cultWidths = [30, 100, 45];
  cultData.forEach((row, ri) => {
    let cx = MARGIN;
    doc.setFillColor(...(ri === 0 ? headerFill : [255, 255, 255]));
    row.forEach((cell, ci) => {
      doc.rect(cx, y - 5, cultWidths[ci], 8, ri === 0 ? "FD" : "S");
      doc.setDrawColor(0);
      setFont(ri === 0 ? 9 : 8, ri === 0 ? "bold" : "normal");
      doc.text(cell.slice(0, 30), cx + 2, y + 1);
      cx += cultWidths[ci];
    });
    y += 8;
  });
  y += LINE_H * 2;

  // 위 내용이 틀림없음을 확인합니다
  setFont(11);
  doc.text("위 내용이 틀림없음을 확인합니다.", A4_W / 2, y, { align: "center" });
  y += LINE_H * 2;

  // 발급일
  const [iy, im, id] = input.issueDate.split("-");
  doc.text(`${iy}년 ${im}월 ${id}일`, A4_W / 2, y, { align: "center" });
  y += LINE_H * 2;

  // 충주친환경유기영농조합법인(육묘부) + 도장
  setFont(11, "bold");
  const orgText = "충주친환경유기영농조합법인(육묘부)";
  doc.text(orgText, A4_W / 2 - 25, y);
  doc.addImage(stampDataUrl, "PNG", A4_W / 2 + 5, y - 8, 18, 18);
  y += LINE_H * 2;

  // 대표 전제락
  setFont(10);
  doc.text("대표 전제락  Tel) 010-5482-0632", A4_W / 2, y, { align: "center" });
  y += LINE_H;
  doc.text("충북 충주시 주덕읍 중원산업1로 40 (당우리 343)", A4_W / 2, y, { align: "center" });

  const blob = doc.output("blob");
  return blob;
}
