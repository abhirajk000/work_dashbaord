import React, { useState } from "react";
import { UserPlus } from "lucide-react";
import { isValidUsername, normalizeUsername } from "../lib/username";

const PIN_MIN_LEN = 4;
const PIN_MAX_LEN = 6;

function normalizePinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, PIN_MAX_LEN);
}

function isCompletePin(pin: string): boolean {
  return pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
}

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const normalized = normalizeUsername(username);
    if (!isValidUsername(normalized)) {
      setError("Username must be 2–30 characters: lowercase letters, numbers, _ or -");
      return;
    }
    if (!isCompletePin(pin)) {
      setError(`PIN must be ${PIN_MIN_LEN}–${PIN_MAX_LEN} digits.`);
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalized, pin }),
      });
      const data = (await res.json()) as { error?: string; username?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        return;
      }
      window.location.href = `/${data.username ?? normalized}`;
    } catch {
      setError("Could not create account. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-dashboard safe-pt safe-px safe-pb flex min-h-dvh flex-col items-center justify-center font-sans text-th-900">
      <div className="panel w-full max-w-sm rounded-2xl border border-th-100-80 p-5 shadow-lg">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-th-50 text-th-700">
            <UserPlus size={22} strokeWidth={2.25} aria-hidden />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-th-800">Create your tracker</h1>
          <p className="text-xs font-medium text-th-500">
            Pick a username and PIN. You&apos;ll log in at <strong>/{`{username}`}</strong>
          </p>
        </div>

        <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-th-500">Username</span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              className="w-full rounded-xl border border-th-200 bg-white px-3 py-2.5 text-sm font-semibold text-th-800 outline-none transition focus:border-th-400 focus:ring-2 focus:ring-th-200"
              placeholder="username"
              autoFocus
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-th-500">PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(normalizePinInput(e.target.value))}
              className="w-full rounded-xl border border-th-200 bg-white px-3 py-2.5 text-center text-lg font-bold tracking-[0.35em] text-th-800 outline-none transition focus:border-th-400 focus:ring-2 focus:ring-th-200"
              placeholder={"•".repeat(PIN_MIN_LEN)}
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-th-500">Confirm PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(normalizePinInput(e.target.value))}
              className="w-full rounded-xl border border-th-200 bg-white px-3 py-2.5 text-center text-lg font-bold tracking-[0.35em] text-th-800 outline-none transition focus:border-th-400 focus:ring-2 focus:ring-th-200"
              placeholder={"•".repeat(PIN_MIN_LEN)}
              disabled={busy}
            />
          </label>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-grad-th-btn px-4 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create tracker"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-th-500">
          Already have one? Go to <a href="/" className="font-semibold text-th-700 underline">your link</a>
        </p>
      </div>
    </div>
  );
}
