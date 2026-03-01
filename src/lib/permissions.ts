import type { AppUser, UserRoleLevel } from "../types";

export const ROLE_LABEL: Record<UserRoleLevel, string> = {
  0: "Lv0 최고관리자",
  1: "Lv1 현황관리 실무자",
  2: "Lv2 일반 실무자(요청 작성 가능)",
  3: "Lv3 일반 사용자(읽기 전용)",
};

/** 권한 등급 안내 팝업용: 등급 순서 */
export const ROLE_LEVELS: UserRoleLevel[] = [0, 1, 2, 3];

export function canManageMembers(user: AppUser | null) {
  return user?.role_level === 0;
}

/** 엑셀 추출: 최고관리자(Lv0)만 */
export function canExportExcel(user: AppUser | null) {
  return user?.role_level === 0;
}

export function canWriteOrders(user: AppUser | null) {
  return user?.role_level === 0 || user?.role_level === 1;
}

export function canRequestEdits(user: AppUser | null) {
  return user?.role_level === 0 || user?.role_level === 1 || user?.role_level === 2;
}

/** 파종계획 반영/반영취소, 일자별 + 버튼(수동 추가): Lv0, Lv1만 */
export function canReflectToPlan(user: AppUser | null) {
  return user?.role_level === 0 || user?.role_level === 1;
}

/** 파종계획 칸에 수동 추가(+): Lv0, Lv1만 (canReflectToPlan과 동일) */
export function canAddPlanItem(user: AppUser | null) {
  return user?.role_level === 0 || user?.role_level === 1;
}

/** 메인 메뉴 '오늘의 할 일' 편집: Lv0, Lv1만 */
export function canEditDailyTodos(user: AppUser | null) {
  return user?.role_level === 0 || user?.role_level === 1;
}

/** 육묘확인서 발급: Lv0, Lv1만 (Lv2, Lv3은 입력/미리보기 가능하나 최종 발급 불가) */
export function canIssueCertificate(user: AppUser | null) {
  return user?.role_level === 0 || user?.role_level === 1;
}

