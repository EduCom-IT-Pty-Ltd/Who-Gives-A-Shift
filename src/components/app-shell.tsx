"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { useApi } from "@/lib/api-client";
import { useAsync } from "@/lib/use-async";
import { loginRequest } from "@/lib/msal";
import type { MeResponse } from "@/lib/types";
import { BrandLockup, LogoLockup } from "./brand";
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
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-surface text-center shadow-[0_18px_50px_-24px_rgba(20,33,61,0.45)]">
        <div className="brand-rule h-1.5" />
        {/* Cream plaque: the artwork was drawn for a warm light ground, so it
            keeps one in either theme. */}
        <div className="bg-[#fdf8f2] px-6 py-7">
          <LogoLockup width={320} className="mx-auto h-auto w-[min(17rem,100%)]" />
        </div>
        <div className="px-6 py-7">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-muted">Kee</p>
          <p className="mb-6 text-sm text-muted">
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
    <header className="sticky top-0 z-10 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="Who Gives A Shift — home">
          <BrandLockup />
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
                className={`rounded-full px-3 py-1.5 font-bold transition ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-ink"
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
      <div className="brand-rule h-1" />
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
