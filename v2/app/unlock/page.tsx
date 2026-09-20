"use client";

import { useState, type FormEvent } from "react";

/**
 * Shown only when `APP_ACCESS_TOKEN` is set and the visitor has no token cookie yet.
 * Submitting appends the token to the URL; middleware validates it, sets the cookie and
 * redirects back to the app.
 */
export default function UnlockPage() {
  const [token, setToken] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (!value) return;
    window.location.href = `/?token=${encodeURIComponent(value)}`;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="glass w-full max-w-sm rounded-2xl border border-border/70 p-6"
      >
        <h1 className="text-[17px] font-semibold tracking-tight">Access token required</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          This deployment is protected. Enter the access token to continue.
        </p>
        <input
          type="password"
          value={token}
          autoFocus
          onChange={(event) => setToken(event.target.value)}
          aria-label="Access token"
          className="mt-4 w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-[13px] outline-none focus-visible:border-ring"
        />
        <button
          type="submit"
          disabled={token.trim().length === 0}
          className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
