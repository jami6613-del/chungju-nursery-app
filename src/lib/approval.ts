export function simulateApprovalEmailRequest(payload: { email: string }) {
  // 실제 메일 발송 대신 “발송됨” 시뮬레이션 로그/알림용
  // 관리자 승인 주소: jami6613@gmail.com
  console.info("[APPROVAL_REQUEST_SIMULATION]", {
    to: "jami6613@gmail.com",
    requestedBy: payload.email,
    message: "승인 요청이 발송되었습니다(시뮬레이션).",
  });
}

