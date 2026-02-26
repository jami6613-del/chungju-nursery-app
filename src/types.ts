export type UserRoleLevel = 0 | 1 | 2 | 3;

export interface AppUser {
  id: string;
  email: string | null;
  name: string | null;
  role_level: UserRoleLevel;
  is_approved: boolean;
}

export interface Order {
  id: string;
  customer_name: string;
  crop_name: string;
  seed_owner: "육묘장" | "주문자";
  sowing_date: string; // ISO date
  shipping_date: string | null; // ISO date
  tray_type: string;
  quantity_base: number;
  quantity_extra: number;
  shipping_quantity: number | null;
  note: string | null;
  created_by: string;
  created_at: string;
  /** 야외 경화 상태로 사용자가 변경한 경우 true */
  outdoor_hardening?: boolean;
}

/** 배추와 동일 취급(파종 후 1일 뒤 실내 육묘 전환) */
const CROPS_AS_BAECHU = ["불암플러스", "불암3호", "잎쌈", "천고마비", "휘파람골드", "황금베타", "진홍쌈"];

/** 실내 육묘 시작일 = 파종일 + N일. 작물별 N 반환 */
export function getIndoorHardeningDays(crop_name: string): number {
  const name = crop_name || "";
  if (name.includes("배추")) return 1;
  if (CROPS_AS_BAECHU.some((c) => name.includes(c))) return 1;
  if (name.includes("들깨")) return 3;
  if (name.includes("대파")) return 4;
  if (name.includes("근대")) return 3;
  if (name.includes("참깨")) return 4;
  return 2;
}

export type OrderStage = "shipped" | "outdoor" | "indoor" | "germination";

/**
 * 작물 상태 표시 우선순위 (높은 것부터 적용)
 * 1. 출하 완료: 출하일·출하수량이 있으면 항상 출하 완료로 표기 (중간 단계 무시)
 * 2. 야외 경화: 사용자가 '야외 경화'로 변경했으면 발아실/실내 육묘 여부와 관계없이 야외 경화로 표기
 * 3. 실내 육묘: 파종일+D+N일 이후 (작물별 N: 배추·불암플러스 등 1, 들깨 3, 근대 3, 대파·참깨 4, 그 외 2)
* 4. 발아실: 파종일 ~ 실내 육묘 시작 전날
* 일반 흐름은 발아실 → 실내 육묘 → 야외경화 → 출하완료이나, 중간 단계를 건너뛸 수 있음.
 */
function getLocalDateString(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function getOrderStage(
  order: Order,
  todayStr: string = getLocalDateString(),
): OrderStage {
  // 1. 출하 완료 최우선
  const hasShipping = !!(
    order.shipping_date &&
    order.shipping_quantity != null &&
    String(order.shipping_quantity).trim() !== ""
  );
  if (hasShipping) return "shipped";

  // 2. 사용자가 지정한 야외 경화
  if (order.outdoor_hardening) return "outdoor";

  // 3·4. 날짜 기준 실내 육묘 / 발아실
  const sowing = order.sowing_date;
  if (!sowing) return "indoor";

  const n = getIndoorHardeningDays(order.crop_name);
  const start = new Date(sowing + "T00:00:00");
  start.setDate(start.getDate() + n);
  const indoorStartStr =
    start.getFullYear() +
    "-" +
    String(start.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(start.getDate()).padStart(2, "0");

  if (todayStr < indoorStartStr) return "germination";
  return "indoor";
}

/** 해당 주문의 실내 육묘 시작일(YYYY-MM-DD). 파종일+N일. */
export function getOrderIndoorStartDate(order: Order): string | null {
  const sowing = order.sowing_date;
  if (!sowing) return null;
  const n = getIndoorHardeningDays(order.crop_name);
  const start = new Date(sowing + "T00:00:00");
  start.setDate(start.getDate() + n);
  return (
    start.getFullYear() +
    "-" +
    String(start.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(start.getDate()).padStart(2, "0")
  );
}

/** 종자소유자 (파종계획·주문 공통) */
export type SeedOwner = "육묘장" | "주문자";

/** 일자별 파종계획 한 건 (주문자, 작물, 수량, 트레이, 종자소유자) */
export interface SowingPlanItem {
  id: string;
  plan_date: string; // ISO date YYYY-MM-DD
  orderer: string;
  crop: string;
  quantity: string;
  tray_type: string; // 200, 406, 직접입력 등
  tray_custom: string; // 직접입력일 때 값
  seed_owner: SeedOwner;
  created_by: string;
  created_at: string;
  source_unprocessed_id: string | null; // 미처리 주문에서 반영된 경우
}

/** 미처리 주문 (전화/문자/구두 등 입력 후 파종계획 반영 전 상태) */
export interface UnprocessedOrder {
  id: string;
  content: string;
  created_by: string;
  created_by_email: string | null;
  created_by_role_level: number | null; // 작성자 권한등급 (상위 등급이 하위 등급 글 수정/삭제 판단용)
  created_at: string;
  reflected_at: string | null;
  reflected_plan_date: string | null; // ISO date
  deleted_at: string | null; // 소프트 삭제 시각
}

