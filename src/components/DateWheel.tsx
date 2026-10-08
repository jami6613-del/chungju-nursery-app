import React from "react";

interface DateWheelProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  size?: "md" | "lg";
  disabled?: boolean;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_KO = "1월,2월,3월,4월,5월,6월,7월,8월,9월,10월,11월,12월".split(",");

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseValue(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function getDaysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

export const DateWheel: React.FC<DateWheelProps> = ({
  label,
  value,
  onChange,
  size = "md",
  disabled = false,
}) => {
  const isLg = size === "lg";
  const [open, setOpen] = React.useState(false);

  const initial = React.useMemo(() => {
    const p = parseValue(value);
    if (p) return p;
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }, [value]);

  const [year, setYear] = React.useState(initial.y);
  const [month, setMonth] = React.useState(initial.m);
  const [day, setDay] = React.useState(initial.d);

  React.useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    if (p) {
      setYear(p.y);
      setMonth(p.m);
      setDay(p.d);
    } else {
      const t = new Date();
      setYear(t.getFullYear());
      setMonth(t.getMonth() + 1);
      setDay(t.getDate());
    }
  }, [open, value]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const handleSelect = (d: number) => {
    setDay(d);
    onChange(toISO(year, month, d));
    setOpen(false);
  };

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };

  const display = value || "날짜 선택";

  return (
    <>
      <div className={`flex flex-col gap-1 text-left ${isLg ? "text-base" : "text-sm"}`}>
        <span className="text-autumn-ink">{label}</span>
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          className={`w-full rounded-xl border border-autumn-border bg-autumn-surface text-left text-autumn-ink shadow-inner shadow-autumn-shadow/5 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50 ${isLg ? "px-4 py-3 text-base" : "px-3 py-2"}`}
        >
          {display}
        </button>
      </div>

      {open && (
        <div className="modal-safe-area fixed inset-0 z-[60] flex items-center justify-center bg-autumn-overlay/55">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0"
            aria-label="닫기"
          />
          <div
            className="relative w-full max-w-md rounded-2xl border border-autumn-border bg-autumn-canvas shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-autumn-border px-4 py-3">
              <div className="text-lg font-semibold text-autumn-ink">{label}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-autumn-body hover:bg-autumn-soft"
              >
                닫기
              </button>
            </div>

            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-autumn-soft text-xl text-autumn-ink hover:bg-autumn-muted"
                >
                  ‹
                </button>
                <div className="text-xl font-semibold text-autumn-ink">
                  {year}년 {MONTH_KO[month - 1]}
                </div>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-autumn-soft text-xl text-autumn-ink hover:bg-autumn-muted"
                >
                  ›
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_KO.map((w) => (
                  <div
                    key={w}
                    className="flex h-11 items-center justify-center text-sm font-medium text-autumn-secondary"
                  >
                    {w}
                  </div>
                ))}
                {days.map((d, i) =>
                  d === null ? (
                    <div key={`e-${i}`} className="h-12" />
                  ) : (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleSelect(d)}
                      className={`flex h-12 w-full items-center justify-center rounded-xl text-base transition-colors ${
                        d === day
                          ? "bg-brand font-semibold text-white"
                          : "text-autumn-ink hover:bg-autumn-soft"
                      }`}
                    >
                      {d}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
