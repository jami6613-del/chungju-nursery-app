import React from "react";
import type { CertificateInput, CertificateRow } from "../lib/certificatePdf";

interface CertificateContentProps {
  input: CertificateInput;
  rows: CertificateRow[];
  stampDataUrl: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const HEADER_BG = "#fffde6";

export function CertificateContent({ input, rows, stampDataUrl, containerRef }: CertificateContentProps) {
  const [iy, im, id] = input.issueDate.split("-");

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
          fontSize: "22pt",
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        친환경육묘내역서
      </h1>

      <h2 style={{ margin: "12px 0 4px 0", fontSize: "12pt", fontWeight: "bold" }}>1. 고객정보</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          {[
            ["성명", input.customerName],
            ["주소", input.address],
            ["주민번호", input.birthId],
            ["연락처", input.contact],
          ].map(([label, value]) => (
            <tr key={label}>
              <td
                style={{
                  width: 35,
                  padding: "4px 6px",
                  backgroundColor: HEADER_BG,
                  border: "1px solid #000",
                  verticalAlign: "middle",
                  fontSize: "10pt",
                }}
              >
                {label}
              </td>
              <td
                style={{
                  padding: "4px 6px",
                  border: "1px solid #000",
                  verticalAlign: "middle",
                  backgroundColor: "#fff",
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ margin: "12px 0 4px 0", fontSize: "12pt", fontWeight: "bold" }}>2. 육묘 일반현황</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            {["품 목", "트레이(구)", "수량", "파종일", "출하일"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "6px 4px",
                  backgroundColor: HEADER_BG,
                  border: "1px solid #000",
                  fontSize: "9pt",
                  fontWeight: "bold",
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
              <td colSpan={5} style={{ padding: 8, border: "1px solid #000", textAlign: "center" }}>
                (데이터 없음)
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: "4px", border: "1px solid #000" }}>{row.품목}</td>
                <td style={{ padding: "4px", border: "1px solid #000" }}>{row["트레이(구)"]}</td>
                <td style={{ padding: "4px", border: "1px solid #000" }}>{row.수량}</td>
                <td style={{ padding: "4px", border: "1px solid #000" }}>{row.파종일}</td>
                <td style={{ padding: "4px", border: "1px solid #000" }}>{row.출하일}</td>
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
                    padding: "4px 6px",
                    border: "1px solid #000",
                    backgroundColor: ri === 0 ? HEADER_BG : "#fff",
                    fontWeight: ri === 0 ? "bold" : "normal",
                    fontSize: ri === 0 ? "9pt" : "8pt",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ margin: "12px 0", textAlign: "center", fontSize: "11pt" }}>위 내용이 틀림없음을 확인합니다.</p>
      <p style={{ margin: "12px 0", textAlign: "center", fontSize: "10pt" }}>
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
        <span style={{ fontSize: "11pt", fontWeight: "bold", whiteSpace: "nowrap" }}>
          충주친환경유기영농조합법인(육묘부)
        </span>
        <img
          src={stampDataUrl}
          alt="도장"
          style={{
            width: 48,
            height: 48,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
      </div>

      <p style={{ margin: "12px 0 4px 0", textAlign: "center", fontSize: "10pt" }}>대표 전제락  Tel) 010-5482-0632</p>
      <p style={{ margin: 0, textAlign: "center", fontSize: "10pt" }}>충북 충주시 주덕읍 중원산업1로 40 (당우리 343)</p>
    </div>
  );
}
