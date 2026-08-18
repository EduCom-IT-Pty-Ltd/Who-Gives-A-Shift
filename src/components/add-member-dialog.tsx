"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { Button, Field, Loading, Note } from "./ui";
import { useApi, jsonBody } from "@/lib/api-client";

interface DirectoryUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string | null;
  jobTitle: string | null;
}

/** Type-ahead against the tenant directory so staff can be rostered pre-login. */
export function AddMemberDialog({
  open,
  onClose,
  storeId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  onAdded: () => void;
}) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    // Debounced: Graph search is rate-limited and every keystroke would burn it.
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      api<DirectoryUser[]>(`/api/directory/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : "Directory search failed"),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, api]);

  const add = async (user: DirectoryUser) => {
    setAddingId(user.id);
    setError(null);
    try {
      await api(
        `/api/stores/${storeId}/members`,
        jsonBody({
          entraObjectId: user.id,
          upn: user.userPrincipalName,
          displayName: user.displayName,
          email: user.mail,
          role: "staff",
        }),
      );
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that person");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add someone to this store">
      <div className="space-y-3">
        <Field
          label="Search your directory"
          placeholder="Name or email"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <Note tone="bad">{error}</Note>}
        {searching && <Loading label="Searching…" />}
        {!searching && results.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {results.map((user) => (
              <li key={user.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.displayName}</p>
                  <p className="truncate text-xs text-muted">{user.userPrincipalName}</p>
                </div>
                <Button
                  variant="primary"
                  loading={addingId === user.id}
                  onClick={() => void add(user)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!searching && query.trim().length >= 2 && !results.length && !error && (
          <p className="text-sm text-muted">No matches in your tenant.</p>
        )}
      </div>
    </Dialog>
  );
}
