"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { Button, Note } from "./ui";
import { useApi } from "@/lib/api-client";
import type { MemberDto } from "@/lib/types";

/**
 * Removal is a soft-delete on the server: the person leaves the roster board but
 * any shift they already worked stays attached to the store's history, so the
 * copy here has to be explicit about what does and does not disappear.
 */
export function RemoveMemberDialog({
  open,
  onClose,
  storeId,
  storeName,
  member,
  shiftCount,
  onRemoved,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  member: MemberDto | null;
  shiftCount: number;
  onRemoved: () => void;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  if (!member) return null;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/stores/${storeId}/members/${member.id}`, { method: "DELETE" });
      onRemoved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this team member");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Remove from roster"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={() => void remove()}>
            Remove from {storeName}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          <span className="font-semibold">{member.displayName}</span> will no longer appear on the{" "}
          <span className="font-semibold">{storeName}</span> roster.
        </p>
        <p className="text-muted">{member.upn}</p>

        {shiftCount > 0 && (
          <Note tone="warn">
            They still have {shiftCount} shift{shiftCount === 1 ? "" : "s"} in this cycle. Removing
            them here does not delete those shifts — open each one and delete it first if this store
            was a mistake.
          </Note>
        )}

        <p className="text-muted">
          You can add them back at any time, and past shifts stay on this store&rsquo;s timesheets.
        </p>
      </div>
    </Dialog>
  );
}
