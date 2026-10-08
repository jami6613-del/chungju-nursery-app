import React from "react";
import type { CertificateInput, CertificateRow } from "../lib/certificatePdf";

interface CertificateContentProps {
  input: CertificateInput;
  rows: CertificateRow[];
  stampDataUrl: string;
  containerRef?: React.Ref<HTMLDivElement>;
}

const INK = "#202923";
const MUTED = "#606962";
const RULE = "#d7ddd8";
const HEADER_BG = "#f1f4f0";
const KEEP_TOGETHER: React.CSSProperties = { pageBreakInside: "avoid", breakInside: "avoid" };
const sectionTitle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: "12pt",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: INK,
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  borderTop: `1px solid ${INK}`,
};

function formatContact(contact: string): string {
  const digits = contact.replace(/\D/g, "");
  if (digits.startsWith("010") && digits.length >= 11) {
    return `010-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length >= 10) {
    return `010-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return contact;
}

export function CertificateContent({ input, rows, stampDataUrl, containerRef }: CertificateContentProps) {
  const [iy, im, id] = input.issueDate.split("-");
  const contactFormatted = formatContact(input.contact);
  const useBusinessNumber = !!input.businessNumber?.trim();
  const idLabel = useBusinessNumber ? "사업자번호" : "생년월일";
  const idValue = useBusinessNumber ? input.businessNumber! : input.birthId;
  const hasAmount = rows.length > 0 && rows.some((r) => r["금액(원)"] != null && r["금액(원)"] !== "");
  const columns: { key: keyof CertificateRow; title: string; unit?: string; width: string; align: "left" | "center" | "right" }[] = [
    { key: "품목", title: "품목", width: hasAmount ? "18%" : "24%", align: "left" },
    { key: "트레이(구)", title: "트레이", unit: "구", width: hasAmount ? "11%" : "12%", align: "center" },
    { key: "수량(판)", title: "수량", unit: "판", width: "10%", align: "right" },
    { key: "수량(주)", title: "수량", unit: "주", width: hasAmount ? "12%" : "14%", align: "right" },
    { key: "파종일", title: "파종일", width: hasAmount ? "16%" : "20%", align: "center" },
    { key: "출하일", title: "출하일", width: hasAmount ? "16%" : "20%", align: "center" },
    ...(hasAmount ? [{ key: "금액(원)" as const, title: "금액", unit: "원", width: "17%", align: "right" as const }] : []),
  ];

  return (
    <div
      ref={containerRef}
      className="certificate-content"
      style={{
        width: "210mm",
        // Leave one CSS pixel for html2canvas rounding to avoid a blank trailing A4 page.
        minHeight: "calc(297mm - 1px)",
        margin: 0,
        padding: "38px 32px 32px",
        fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Noto Sans CJK KR', sans-serif",
        fontSize: "10pt",
        lineHeight: 1.5,
        color: INK,
        backgroundColor: "#fff",
        boxSizing: "border-box",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <h1 style={{ margin: "0 0 36px", fontSize: "29pt", lineHeight: 1.3, fontWeight: 700, textAlign: "center", letterSpacing: "0.1em", color: INK }}>
        친환경육묘내역서
      </h1>

      <section style={{ ...KEEP_TOGETHER, marginBottom: 24 }}>
        <h2 style={sectionTitle}>1. 고객정보</h2>
        <div style={{ borderTop: `1px solid ${INK}`, borderBottom: `1px solid ${RULE}`, padding: "10px 0" }}>
          <div style={{ display: "flex", gap: 16 }}>
            {[["성명", input.customerName], [idLabel, idValue], ["연락처", contactFormatted]].map(([label, value]) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 8, flex: "1 1 0", minWidth: 0 }}>
                <div style={{ flexShrink: 0, fontSize: "12pt", color: MUTED }}>{label}</div>
                <div style={{ minWidth: 0, fontSize: "15pt", fontWeight: label === "성명" ? 600 : 400, overflowWrap: "anywhere" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${RULE}` }}>
            <div style={{ flexShrink: 0, width: 32, fontSize: "12pt", color: MUTED }}>주소</div>
            <div style={{ minWidth: 0, fontSize: "15pt", overflowWrap: "anywhere" }}>{input.address}</div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ ...sectionTitle, pageBreakAfter: "avoid", breakAfter: "avoid" }}>2. 육묘 일반현황</h2>
        <table style={tableStyle}>
          <colgroup>{columns.map(({ key, width }) => <col key={key} style={{ width }} />)}</colgroup>
          <thead style={KEEP_TOGETHER}>
            <tr style={KEEP_TOGETHER}>
              {columns.map(({ key, title, unit, align }) => (
                <th key={key} scope="col" style={{ padding: "10px 6px", border: `1px solid ${RULE}`, backgroundColor: HEADER_BG, fontSize: "15pt", fontWeight: 600, lineHeight: 1.4, textAlign: align, verticalAlign: "middle" }}>
                  {title}{unit && <span style={{ display: "block", fontSize: "15pt", fontWeight: 400, color: MUTED }}>({unit})</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr style={KEEP_TOGETHER}>
                <td colSpan={columns.length} style={{ padding: "18px 6px", border: `1px solid ${RULE}`, textAlign: "center", fontSize: "14pt", color: MUTED }}>(데이터 없음)</td>
              </tr>
            ) : rows.map((row, i) => (
              <tr key={i} style={KEEP_TOGETHER}>
                {columns.map(({ key, align }) => (
                  <td key={key} style={{ padding: "12px 6px", border: `1px solid ${RULE}`, textAlign: align, fontSize: "14pt", lineHeight: 1.5, verticalAlign: "middle", overflowWrap: "anywhere", wordBreak: key === "품목" ? "keep-all" : "normal" }}>
                    {row[key] ?? (key === "금액(원)" ? "-" : "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ ...KEEP_TOGETHER, paddingTop: 12 }}>
        <section style={{ ...KEEP_TOGETHER, marginBottom: 32 }}>
          <h2 style={sectionTitle}>3. 육묘 재배내역</h2>
          <table style={tableStyle}>
            <colgroup><col style={{ width: "16%" }} /><col style={{ width: "60%" }} /><col style={{ width: "24%" }} /></colgroup>
            <thead>
              <tr>
                {["구분", "재배내역", "비고"].map((label) => (
                  <th key={label} scope="col" style={{ padding: "10px 6px", border: `1px solid ${RULE}`, backgroundColor: HEADER_BG, fontSize: "15pt", fontWeight: 600, textAlign: "left" }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["상토제조", "부농(주) - 부농 원예용상토(유기농)", "공시-3-2-068"],
                ["병해방제", "나라바이오(주) - 모두싹", "공시-3-6-016"],
              ].map((row, ri) => (
                <tr key={ri} style={KEEP_TOGETHER}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding: "12px 6px", border: `1px solid ${RULE}`, fontSize: "15pt", textAlign: "left", verticalAlign: "middle", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
  
        <footer style={{ ...KEEP_TOGETHER, textAlign: "center" }}>
          <p style={{ margin: "0 0 10px", fontSize: "12pt" }}>위 내용이 틀림없음을 확인합니다.</p>
          <p style={{ margin: "0 0 12px", fontSize: "11pt", color: MUTED }}>{iy}년 {im}월 {id}일</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "nowrap", minHeight: 52 }}>
            <span style={{ fontSize: "12pt", fontWeight: 700, whiteSpace: "nowrap" }}>충주친환경유기영농조합법인(육묘부)</span>
            <img src={stampDataUrl} alt="도장" style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0 }} />
          </div>
          <p style={{ margin: "10px 0 4px", fontSize: "11pt", color: MUTED }}>대표 전제락  Tel) 010-5482-0632</p>
          <p style={{ margin: 0, fontSize: "11pt", color: MUTED }}>충북 충주시 주덕읍 중원산업1로 40 (당우리 343)</p>
        </footer>
      </div>
    </div>
  );
}
