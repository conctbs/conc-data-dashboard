"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { parseJsonResponse } from "@/lib/http";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/settings");
      const { body, error: responseError } = await parseJsonResponse<Record<string, unknown>>(response);
      if (!response.ok || responseError) {
        setError(responseError ?? "Failed to load settings.");
        setLoading(false);
        return;
      }
      setSettings(body);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading settings..." />;
  if (error || !settings) return <ErrorState message={error ?? "Settings unavailable."} />;

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="mt-2 text-sm text-slate-500">
          App configuration and auth readiness. Login is scaffolded but intentionally not enforced.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <p className="font-medium">Application</p>
          <pre className="mt-3 overflow-auto rounded-2xl bg-shell p-4 text-sm text-slate-600">
            {JSON.stringify(settings.app, null, 2)}
          </pre>
        </div>

        <div className="card p-5">
          <p className="font-medium">Authentication scaffold</p>
          <pre className="mt-3 overflow-auto rounded-2xl bg-shell p-4 text-sm text-slate-600">
            {JSON.stringify(settings.auth, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}
