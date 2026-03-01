/** 사전 등록된 고객 정보 (성명 → 주소, 생년월일/사업자번호, 연락처) */
export const CUSTOMER_PRESETS: Record<
  string,
  { address: string; birthId?: string; businessNumber?: string; contact: string }
> = {
  전선미: { address: "충주시 상용두3길 41", birthId: "831115-2", contact: "010-2504-5036" },
  전성진: { address: "충주시 상용두3길 43", birthId: "560618-1", contact: "010-4412-0175" },
  전현철: { address: "충주시 상용두3길 43", birthId: "860209-1", contact: "010-5202-0175" },
  "흙을 만드는 사람들": {
    address: "충주시 금가면 오미기2길 81",
    businessNumber: "303-81-73959",
    contact: "010-5063-6369",
  },
  "팜 친환경 영농조합법인": {
    address: "충주시 금가면 오미기2길 81",
    businessNumber: "303-81-73959",
    contact: "010-6563-6211",
  },
  강대균: {
    address: "충주시 금릉로45 현대@ 104-408",
    birthId: "631020-1",
    contact: "010-5063-6369",
  },
  권헌상: { address: "충주시 칠지3길, 19", birthId: "581123-1", contact: "010-5482-3259" },
  김향숙: { address: "충주시 칠지3길, 19", birthId: "581123-2", contact: "010-5482-3259" },
  권혁조: { address: "충주시 칠지 4길 22", birthId: "520602-1", contact: "010-2101-9199" },
  오영미: { address: "충주시 대소원면 모단길 20-9", birthId: "711215-2", contact: "010-5486-4225" },
  김수천: { address: "충주시 하용두3길 60", birthId: "950901-1", contact: "010-9193-4225" },
  김낙문: { address: "충주시 대소원면 하검단 1길 19-5", birthId: "601010-1", contact: "010-5486-4225" },
  안옥분: { address: "충주시 번영대로 120 세원@ 105-505", birthId: "650110-2", contact: "010-5586-2944" },
  이경선: { address: "충주시 금봉대로 397", birthId: "710507-1", contact: "010-8845-0794" },
  임형락: { address: "충주시 하방3길 19", birthId: "631229-1", contact: "010-3775-2816" },
  류근모: { address: "충주시 신니면 용원리 120", birthId: "600113-1", contact: "010-4646-9999" },
  유병찬: { address: "충주시 신니면 마수리 400-1", birthId: "880902-1", contact: "010-4224-0798" },
  이상덕: { address: "충주시 주덕읍 신양로 76-1", birthId: "630120-1", contact: "010-9487-6530" },
  천윤옥: { address: "충주시 하용두 2길 33", birthId: "570401-2", contact: "010-8853-0979" },
  이한출: { address: "충주시 하용두 2길 33", birthId: "550304-1", contact: "010-8853-0979" },
  이상원: { address: "충주시 하용두 2길 33", birthId: "761020-1", contact: "010-8853-0979" },
  홍승관: { address: "충주시 주덕읍 신양로 80", birthId: "560706-1", contact: "010-3464-0120" },
  홍태순: { address: "충주시 신니면 성하2길 60", birthId: "870406-1", contact: "010-2633-5048" },
  최미자: { address: "충주시 신니면 성하2길 60", birthId: "570711-2", contact: "010-9486-5048" },
  허대규: { address: "충주시 벌터 4길 26", birthId: "700507-1", contact: "010-3178-0146" },
};

/** 발급 시 성명에 따라 실제 주문 데이터를 불러올 주문자 매핑 */
export const CERTIFICATE_ORDERER_MAP: Record<string, string> = {
  강대균: "흙만사",
  "흙을 만드는 사람들": "흙만사",
  "팜 친환경 영농조합법인": "흙만사",
  김향숙: "권헌상",
  김낙문: "수천",
  김수천: "수천",
  오영미: "수천",
  류근모: "장안농장",
  유병찬: "장안농장",
  전성진: "태민",
  전선미: "태민",
  전현철: "태민",
  천윤옥: "현대",
  이한출: "현대",
  이상원: "현대",
};

/** 성명에 해당하는 사전 등록 정보 반환 */
export function getCustomerPreset(name: string) {
  const trimmed = name.trim();
  return CUSTOMER_PRESETS[trimmed] ?? null;
}

/** 발급 시 실제 주문 데이터를 불러올 주문자명 반환 (매핑 없으면 입력된 성명 사용) */
export function getOrdererForCertificate(certificateName: string): string {
  const mapped = CERTIFICATE_ORDERER_MAP[certificateName.trim()];
  return mapped ?? certificateName.trim();
}

/** 성명 자동완성 시 제외할 주문자 (프리셋으로 대체됨 - '흙만사' 등) */
export const EXCLUDED_ORDERERS_FROM_AUTOCOMPLETE = new Set(Object.values(CERTIFICATE_ORDERER_MAP));
