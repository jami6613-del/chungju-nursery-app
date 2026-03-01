import type { Order } from "../types";

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
