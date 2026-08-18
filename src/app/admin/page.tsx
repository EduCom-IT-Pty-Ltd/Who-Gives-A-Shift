"use client";

import { useState } from "react";
import { AppShell, useMe } from "@/components/app-shell";
import { Badge, Button, Card, Empty, Field, Loading, Note } from "@/components/ui";
import { jsonBody, patchBody, useApi } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";

interface StoreRow {
  id: string;
  name: string;
  code: string;
  timezone: string;
  managerGroupId: string | null;
  active: boolean;
}

const BLANK = { name: "", code: "", timezone: "Australia/Sydney", managerGroupId: "" };

interface SettingsResponse {
  email: string;
  source: "settings" | "environment";
}

function Admin() {
  const me = useMe();
  const api = useApi();
  const stores = useAsync<StoreRow[]>(() => api<StoreRow[]>("/api/stores"), []);
  const settings = useAsync<SettingsResponse>(() => api<SettingsResponse>("/api/settings"), []);

  const [draft, setDraft] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [reviewerEmail, setReviewerEmail] = useState("");

  if (!me.isAdmin) {
    return <Note tone="warn">This page is for tenant administrators.</Note>;
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(
        "/api/stores",
        jsonBody({
          name: draft.name.trim(),
          code: draft.code.trim(),
          timezone: draft.timezone.trim(),
          managerGroupId: draft.managerGroupId.trim() || null,
        }),
      );
      setDraft(BLANK);
      stores.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the store");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    try {
      await api(`/api/stores/${id}`, patchBody(body));
      stores.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the store");
    }
  };

  const saveReviewer = async () => {
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      await api(
        "/api/settings",
        patchBody({ submissionReviewerEmail: reviewerEmail.trim() || settings.data?.email }),
      );
      settings.reload();
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : "Could not update settings");
    } finally {
      setSettingsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Stores</h1>
        <p className="text-sm text-muted">
          Admins manage every store. To hand a store to its own manager later, put their
          Entra security group&rsquo;s object ID against it below — until then, leave it blank.
        </p>
      </div>

      {error && <Note tone="bad">{error}</Note>}

      <Card title="Submission settings">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted">
            Timesheet submissions are sent to this reviewer. Change it here for testing without
            redeploying the app. It does not change who sends the email: it still comes from the
            manager who submits the cycle.
          </p>
          {settings.error && <Note tone="bad">{settings.error}</Note>}
          {settingsError && <Note tone="bad">{settingsError}</Note>}
          <Field
            label="Submission reviewer email"
            type="email"
            placeholder="payroll@example.com"
            value={reviewerEmail || settings.data?.email || ""}
            onChange={(e) => setReviewerEmail(e.target.value)}
            hint={
              settings.data?.source === "environment"
                ? "Using the deployment fallback until you save a value here."
                : "Saved in the application settings."
            }
          />
          <Button
            variant="primary"
            loading={settingsBusy}
            disabled={!(reviewerEmail || settings.data?.email)}
            onClick={() => void saveReviewer()}
          >
            Save reviewer email
          </Button>
        </div>
      </Card>

      <Card title="Add a store">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field
            label="Store name"
            placeholder="Kee Newtown"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Field
            label="Code"
            placeholder="NEWTOWN"
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
          <Field
            label="Timezone"
            hint="IANA name, e.g. Australia/Sydney or Australia/Brisbane"
            value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
          />
          <Field
            label="Manager group (Entra object ID)"
            hint="Copy the Object ID from the security group in Entra ID"
            value={draft.managerGroupId}
            onChange={(e) => setDraft({ ...draft, managerGroupId: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Button
              variant="primary"
              loading={busy}
              disabled={!draft.name.trim() || !draft.code.trim()}
              onClick={() => void create()}
            >
              Create store
            </Button>
          </div>
        </div>
      </Card>

      <Card title="All stores">
        {stores.loading ? (
          <Loading />
        ) : stores.error ? (
          <div className="p-4">
            <Note tone="bad">{stores.error}</Note>
          </div>
        ) : !stores.data?.length ? (
          <Empty>No stores yet.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {stores.data.map((store) => (
              <li key={store.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{store.name}</span>
                  <Badge>{store.code}</Badge>
                  <Badge>{store.timezone}</Badge>
                  {!store.active && <Badge tone="bad">Inactive</Badge>}
                  {!store.managerGroupId && <Badge>Admins only</Badge>}
                  <Button
                    className="ml-auto"
                    onClick={() => void patch(store.id, { active: !store.active })}
                  >
                    {store.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
                <Field
                  label="Manager group object ID"
                  defaultValue={store.managerGroupId ?? ""}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== store.managerGroupId) {
                      void patch(store.id, { managerGroupId: next });
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <Admin />
    </AppShell>
  );
}
