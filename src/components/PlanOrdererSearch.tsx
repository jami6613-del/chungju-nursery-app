import React from "react";
import { Modal } from "./Modal";
import { fetchPendingSowingPlans } from "../lib/planningApi";
import { getKoreaPlanDate, searchPendingPlans } from "../lib/pendingPlans";
import type { SowingPlanItem } from "../types";

export function PlanOrdererSearch({ onClose }: { onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [plans, setPlans] = React.useState<SowingPlanItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refresh, setRefresh] = React.useState(0);
  const [today, setToday] = React.useState(getKoreaPlanDate);

  React.useEffect(() => {
    const timer = setInterval(() => setToday(getKoreaPlanDate()), 1000);
    return () => clearInterval(timer);
  }, []);
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchPendingSowingPlans(today).then((items) => {
      if (active) setPlans(items);
    }).catch(() => {
      if (active) setError("파종계획을 불러오지 못했습니다. 다시 시도해 주세요.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [today, refresh]);

  const results = searchPendingPlans(plans, name);
  return (
    <Modal open title="주문자별 예정 파종 검색" onClose={onClose}>
      <p className="mb-3 text-sm text-autumn-secondary">
        오늘({today})부터 예정된 파종 중 현황에 반영하지 않은 내역을 검색합니다.
      </p>
      <label htmlFor="plan-orderer-search" className="mb-1 block text-sm font-medium text-autumn-ink">주문자 이름</label>
      <div className="flex gap-2">
        <input
          id="plan-orderer-search" type="search" autoFocus autoComplete="off"
          placeholder="이름 전체 또는 일부 입력"
          value={name} onChange={(event) => setName(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-autumn-border bg-white px-3 py-2 text-base text-autumn-ink focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}
          className="shrink-0 rounded-lg bg-autumn-soft px-3 py-2 text-sm text-autumn-ink disabled:opacity-50">새로고침</button>
      </div>
      <div className="mt-4" aria-live="polite" aria-busy={loading}>
        {loading ? <p className="py-6 text-center text-autumn-secondary">파종계획을 불러오는 중...</p>
          : error ? <div role="alert" className="py-4 text-center text-red-700"><p>{error}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-2 rounded-lg bg-autumn-soft px-3 py-2 text-autumn-ink">다시 시도</button></div>
          : !name.trim() ? <p className="py-6 text-center text-autumn-secondary">주문자 이름을 입력해 주세요.</p>
          : results.length === 0 ? <p className="py-6 text-center text-autumn-secondary">해당 주문자의 예정된 미반영 파종계획이 없습니다.</p>
          : <>
            <p className="mb-2 text-sm font-medium text-autumn-ink">검색 결과 {results.length}건 · 파종일순</p>
            <ul className="space-y-2">
              {results.map((item) => <li key={item.id} className="rounded-lg border border-autumn-border bg-autumn-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-autumn-ink">{item.orderer}</span>
                  <span className="text-sm font-medium text-amber-700">{item.plan_date}{item.plan_date === today ? " · 오늘" : ""}</span>
                </div>
                <p className="mt-1 break-words text-base font-medium text-autumn-ink">{item.crop || "작물 미지정"}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-autumn-secondary">
                  <span>수량 {item.quantity || "-"}판</span>
                  <span>트레이 {item.tray_type === "직접입력" ? item.tray_custom || "-" : item.tray_type || "-"}</span>
                  <span>종자 {item.seed_owner}</span>
                </div>
              </li>)}
            </ul>
          </>}
      </div>
    </Modal>
  );
}
