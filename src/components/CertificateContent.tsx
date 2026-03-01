import React from "react";
import type { CertificateInput, CertificateRow } from "../lib/certificatePdf";

interface CertificateContentProps {
  input: CertificateInput;
  rows: CertificateRow[];
  stampDataUrl: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const HEADER_BG = "#fffde6";

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

  return (
    <div
      ref={containerRef}
      className="certificate-content"
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: 0,
        padding: "18px",
        fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
        fontSize: "10pt",
        color: "#000",
        backgroundColor: "#fff",
        boxSizing: "border-box",
      }}
    >
      <h1
        style={{
          margin: "0 0 12px 0",
          fontSize: "29pt",
          fontWeight: "bold",
          textAlign: "center",
          letterSpacing: "0.25em",
        }}
      >
        친환경육묘내역서
      </h1>

      <h2 style={{ margin: "12px 0 4px 0", fontSize: "12pt", fontWeight: "bold" }}>1. 고객정보</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ width: "12%", padding: "8px 6px", backgroundColor: HEADER_BG, border: "1px solid #000", textAlign: "center", verticalAlign: "middle", fontSize: "15pt" }}>성명</td>
            <td style={{ width: "38%", padding: "8px 6px", border: "1px solid #000", textAlign: "left", verticalAlign: "middle", fontSize: "15pt" }}>{input.customerName}</td>
            <td style={{ width: "12%", padding: "8px 6px", backgroundColor: HEADER_BG, border: "1px solid #000", textAlign: "center", verticalAlign: "middle", fontSize: "15pt" }}>주소</td>
            <td style={{ width: "38%", padding: "8px 6px", border: "1px solid #000", textAlign: "left", verticalAlign: "middle", fontSize: "15pt" }}>{input.address}</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 6px", backgroundColor: HEADER_BG, border: "1px solid #000", textAlign: "center", verticalAlign: "middle", fontSize: "15pt" }}>{idLabel}</td>
            <td style={{ padding: "8px 6px", border: "1px solid #000", textAlign: "left", verticalAlign: "middle", fontSize: "15pt" }}>{idValue}</td>
            <td style={{ padding: "8px 6px", backgroundColor: HEADER_BG, border: "1px solid #000", textAlign: "center", verticalAlign: "middle", fontSize: "15pt" }}>연락처</td>
            <td style={{ padding: "8px 6px", border: "1px solid #000", textAlign: "left", verticalAlign: "middle", fontSize: "15pt" }}>{contactFormatted}</td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ margin: "12px 0 4px 0", fontSize: "12pt", fontWeight: "bold" }}>2. 육묘 일반현황</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            {[
              { h: "품 목", w: "18%" },
              { h: "트레이(구)", w: "11%" },
              { h: "수량(판)", w: "10%" },
              { h: "수량(주)", w: "10%" },
              { h: "파종일", w: "13%" },
              { h: "출하일", w: "13%" },
            ].map(({ h, w }) => (
              <th
                key={h}
                style={{
                  width: w,
                  padding: "8px 4px",
                  backgroundColor: HEADER_BG,
                  border: "1px solid #000",
                  fontSize: "15pt",
                  fontWeight: "bold",
                  textAlign: "center",
                  verticalAlign: "middle",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: 10, border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>
                (데이터 없음)
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: "8px 4px", border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>{row.품목}</td>
                <td style={{ padding: "8px 4px", border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>{row["트레이(구)"]}</td>
                <td style={{ padding: "8px 4px", border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>{row["수량(판)"]}</td>
                <td style={{ padding: "8px 4px", border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>{row["수량(주)"]}</td>
                <td style={{ padding: "8px 4px", border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>{row.파종일}</td>
                <td style={{ padding: "8px 4px", border: "1px solid #000", textAlign: "center", fontSize: "14pt", verticalAlign: "middle" }}>{row.출하일}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2 style={{ margin: "12px 0 4px 0", fontSize: "12pt", fontWeight: "bold" }}>3. 육묘 재배내역</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          {[
            ["구분", "재배내역", "비고"],
            ["상토제조", "부농(주) - 부농 원예용상토(유기농)", "공시-3-2-068"],
            ["병해방제", "나라바이오(주) - 모두싹", "공시-3-6-016"],
          ].map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "8px 6px",
                    border: "1px solid #000",
                    backgroundColor: ri === 0 ? HEADER_BG : "#fff",
                    fontWeight: ri === 0 ? "bold" : "normal",
                    fontSize: ri === 0 ? "15pt" : "14pt",
                    textAlign: "center",
                    verticalAlign: "middle",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <p style={{ margin: "12px 0", textAlign: "center", fontSize: "12pt" }}>위 내용이 틀림없음을 확인합니다.</p>
        <p style={{ margin: "12px 0", textAlign: "center", fontSize: "11pt" }}>
          {iy}년 {im}월 {id}일
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 12,
            flexWrap: "nowrap",
          }}
        >
          <span style={{ fontSize: "12pt", fontWeight: "bold", whiteSpace: "nowrap" }}>
            충주친환경유기영농조합법인(육묘부)
          </span>
          <img
            src={stampDataUrl}
            alt="도장"
            style={{
              width: 52,
              height: 52,
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
        </div>

        <p style={{ margin: "12px 0 4px 0", textAlign: "center", fontSize: "11pt" }}>대표 전제락  Tel) 010-5482-0632</p>
        <p style={{ margin: 0, textAlign: "center", fontSize: "11pt" }}>충북 충주시 주덕읍 중원산업1로 40 (당우리 343)</p>
      </div>
    </div>
  );
}
