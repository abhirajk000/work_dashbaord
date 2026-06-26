import React from "react";
import ProductivityDashboard from "../productivity-dashboard";
import SignupPage from "./signup";
import { LEGACY_USERNAME } from "../lib/legacy-user";
import { isValidUsername, normalizeUsername } from "../lib/username";

function getLegacyUsername(): string {
  const fromEnv = import.meta.env.VITE_LEGACY_USERNAME;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return normalizeUsername(fromEnv);
  }
  return LEGACY_USERNAME;
}

function UnknownUserPage({ name }: { name: string }) {
  return (
    <div className="bg-dashboard safe-pt safe-px safe-pb flex min-h-dvh flex-col items-center justify-center font-sans text-th-900">
      <div className="panel w-full max-w-sm rounded-2xl border border-th-100-80 p-5 text-center shadow-lg">
        <h1 className="text-lg font-extrabold tracking-tight text-th-800">Not found</h1>
        <p className="mt-2 text-xs font-medium text-th-500">
          No tracker for <strong>/{name}</strong>.
        </p>
        <a
          href="/signup"
          className="mt-4 inline-block w-full rounded-xl bg-grad-th-btn px-4 py-2.5 text-sm font-bold text-white shadow-sm"
        >
          Create tracker
        </a>
      </div>
    </div>
  );
}

type Route =
  | { kind: "signup" }
  | { kind: "tracker"; username: string; personalizedPin: boolean }
  | { kind: "unknown"; name: string };

function getRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const legacyUsername = getLegacyUsername();

  if (path === "/signup") return { kind: "signup" };

  // Root URL — same as before: one shared tracker, previous PIN
  if (path === "/") {
    return { kind: "tracker", username: legacyUsername, personalizedPin: false };
  }

  const segment = path.slice(1).split("/")[0] ?? "";
  const username = normalizeUsername(segment);
  if (isValidUsername(username)) {
    return { kind: "tracker", username, personalizedPin: true };
  }

  return { kind: "unknown", name: segment || "?" };
}

export default function App() {
  const route = getRoute();

  if (route.kind === "signup") return <SignupPage />;
  if (route.kind === "unknown") return <UnknownUserPage name={route.name} />;
  return (
    <ProductivityDashboard
      username={route.username}
      personalizedPin={route.personalizedPin}
    />
  );
}
