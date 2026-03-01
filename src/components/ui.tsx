import React from "react";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  size = "md",
  inputClassName,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  disabled?: boolean;
  size?: "md" | "lg";
  inputClassName?: string;
  /** number 타입에서 소수점 허용 시 step="any" */
  step?: string;
}) {
  const isLg = size === "lg";
  return (
    <label className={`flex flex-col gap-0.5 sm:gap-1 ${isLg ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}>
      <span className="text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border border-slate-700 bg-slate-900 text-slate-50 shadow-inner shadow-black/40 focus:border-brand focus:outline-none disabled:opacity-60 sm:rounded-xl placeholder-slate-500 ${isLg ? "px-3 py-2 text-sm sm:px-4 sm:py-3 sm:text-base" : "px-2.5 py-1.5 text-sm sm:px-3 sm:py-2"} ${inputClassName ?? ""}`}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  size = "md",
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const isLg = size === "lg";
  return (
    <label className={`flex flex-col gap-0.5 sm:gap-1 ${isLg ? "text-sm sm:text-base" : "text-xs sm:text-sm"}`}>
      <span className="text-slate-200">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border border-slate-700 bg-slate-900 text-slate-50 shadow-inner shadow-black/40 focus:border-brand focus:outline-none disabled:opacity-60 sm:rounded-xl ${isLg ? "px-3 py-2 text-sm sm:px-4 sm:py-3 sm:text-base" : "px-2.5 py-1.5 text-sm sm:px-3 sm:py-2"}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const isLg = size === "lg";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg bg-brand font-semibold text-white shadow-lg shadow-black/30 hover:bg-brand-dark disabled:opacity-60 sm:rounded-xl ${isLg ? "px-4 py-2.5 text-sm sm:px-5 sm:py-3 sm:text-base" : "px-3 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const isLg = size === "lg";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border border-slate-700 bg-slate-900 font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-60 sm:rounded-xl ${isLg ? "px-4 py-2.5 text-sm sm:px-5 sm:py-3 sm:text-base" : "px-3 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"}`}
    >
      {children}
    </button>
  );
}

