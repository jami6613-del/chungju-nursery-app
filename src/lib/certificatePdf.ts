import type { Order } from "../types";

export interface CertificateInput {
  customerName: string;
  address: string;
  birthId: string; // YYYYMMDD-0****** (생년월일)
  businessNumber?: string; // 사업자번호 (있으면 생년월일 대신 표기)
  contact: string;
  cropName: string | null;
  issueDate: string;
  /** 작물별 판당 금액(원). 있으면 증명서에 금액(원) 열 표시 */
  cropPrices?: Record<string, number>;
}

export interface CertificateRow {
  품목: string;
  "트레이(구)": string;
  "수량(판)": string;
  "수량(주)": string;
  파종일: string;
  출하일: string;
  "금액(원)"?: string;
}

function parseTrayNumber(tray: string): number {
  const m = /[\d.]+/.exec(tray);
  return m ? parseFloat(m[0]) || 0 : 0;
}

function formatWithComma(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 필터된 주문을 인증서 행으로 변환. cropPrices 있으면 금액(원) 계산. 파종일 빠른 순 정렬, 수량(판)은 기본수량만 */
export function ordersToRows(
  orders: Order[],
  cropPrices?: Record<string, number> | null,
): CertificateRow[] {
  const rows = orders.map((o) => {
    const tray = o.tray_type ?? "";
    const trayFormatted = /^\d+$/.test(tray) ? `${tray}구` : tray;
    const qtyPan = Number(o.quantity_base ?? 0);
    const trayNum = parseTrayNumber(tray);
    const qtyJu = Math.round(trayNum * qtyPan);
    const cropName = o.crop_name ?? "";
    const pricePerPan = cropPrices && cropName ? (cropPrices[cropName] ?? 0) : 0;
    const amount = pricePerPan > 0 ? Math.round(qtyPan * pricePerPan) : undefined;
    const row: CertificateRow = {
      품목: cropName,
      "트레이(구)": trayFormatted,
      "수량(판)": String(qtyPan),
      "수량(주)": trayNum > 0 ? formatWithComma(qtyJu) : "-",
      파종일: o.sowing_date ?? "",
      출하일: o.shipping_date ?? "",
    };
    if (amount !== undefined && amount >= 0) row["금액(원)"] = formatWithComma(amount);
    return row;
  });
  rows.sort((a, b) => (a.파종일 || "").localeCompare(b.파종일 || ""));
  return rows;
}

/** HTML 요소를 PDF Blob으로 변환 (한글 지원, 도장 투명 배경) */
export async function createCertificatePdf(element: HTMLElement): Promise<Blob> {
  const { default: html2pdf } = await import("html2pdf.js");
  const worker = html2pdf()
    .set({
      margin: 0,
      image: { type: "png", quality: 1 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", compress: false },
      pagebreak: { mode: ["css", "legacy"], before: ".html2pdf__page-break" },
    })
    .from(element)
    .toPdf();
  const blob = await worker.outputPdf("blob");
  return blob as Blob;
}
