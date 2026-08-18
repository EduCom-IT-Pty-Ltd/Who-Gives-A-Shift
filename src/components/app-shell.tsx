"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { useApi } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { loginRequest } from "@/lib/msal";
import type { MeResponse } from "@/lib/types";
import { Button, Loading, Note } from "./ui";

const MeContext = createContext<MeResponse | null>(null);

export function useMe(): MeResponse {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside AppShell");
  return me;
}

function SignIn() {
  const { instance } = useMsal();
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted">Kee</p>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Who Gives A Shift</h1>
        <p className="mb-7 text-sm text-muted">
          Rosters and timesheets, signed in with your work account.
        </p>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => void instance.loginRedirect(loginRequest)}
        >
          Sign in with Microsoft
        </Button>
      </div>
    </main>
  );
}

const NAV = [
  { href: "/", label: "My shifts" },
  { href: "/roster", label: "Roster" },
  { href: "/timesheets", label: "Timesheets" },
] as const;

function Nav({ me }: { me: MeResponse }) {
  const pathname = usePathname();
  const { instance } = useMsal();
  const account = instance.getActiveAccount();

  const links = me.isAdmin ? [...NAV, { href: "/admin", label: "Admin" } as const] : NAV;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Who Gives A Shift
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1.5 transition ${
                  active ? "bg-accent-soft font-medium text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">
            {account?.name ?? me.user.displayName}
          </span>
          <Button
            variant="ghost"
            onClick={() => void instance.logoutRedirect({ postLogoutRedirectUri: "/" })}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

function Authenticated({ children }: { children: ReactNode }) {
  const api = useApi();
  const me = useAsync<MeResponse>(() => api<MeResponse>("/api/me"), []);

  if (me.loading) return <Loading label="Loading your account…" />;
  if (me.error || !me.data) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Note tone="bad">{me.error ?? "Could not load your account."}</Note>
      </main>
    );
  }

  return (
    <MeContext.Provider value={me.data}>
      <Nav me={me.data} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </MeContext.Provider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <UnauthenticatedTemplate>
        <SignIn />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <Authenticated>{children}</Authenticated>
      </AuthenticatedTemplate>
    </>
  );
}
