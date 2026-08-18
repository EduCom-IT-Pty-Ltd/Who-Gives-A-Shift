"use client";

import type { StoreSummary } from "@/lib/types";

export function StorePicker({
  stores,
  value,
  onChange,
  label = "Store",
}: {
  stores: StoreSummary[];
  value: string;
  onChange: (storeId: string) => void;
  label?: string;
}) {
  if (stores.length <= 1) {
    const only = stores[0];
    return only ? (
      <p className="text-sm font-semibold">
        {only.name} <span className="font-normal text-muted">· {only.code}</span>
      </p>
    ) : null;
  }

  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface px-3 py-2 outline-none transition focus:border-accent"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name} · {store.code}
          </option>
        ))}
      </select>
    </label>
  );
}
