import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, CalendarDays, GraduationCap, Sparkles, Users } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { getDashboardAlerts, getDashboardStats, listEvents, type DashboardAlerts, type DashboardStats } from "@/db/repos";
import type { EventRow } from "@/db/schema";
import { prettyDate, today } from "@/lib/format";

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, a, evs] = await Promise.all([getDashboardStats(), getDashboardAlerts(), listEvents()]);
        setStats(s);
        setAlerts(a);
        const t = today();
        setUpcoming(evs.filter((e) => e.isActive && e.eventDate >= t).slice(0, 5));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your dojang at a glance." />

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">Failed to load: {error}</div>}

      {!error && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat icon={<Users size={18} />} label="Active Students" value={stats?.activeTotal} onClick={() => navigate("/students")} />
            <Stat icon={<span className="text-base leading-none">🐯</span>} label="Tiger Cubs" value={stats?.tiger} onClick={() => navigate("/students?track=tiger")} />
            <Stat icon={<Users size={18} />} label="Jr./Adult" value={stats?.regular} onClick={() => navigate("/students?track=regular")} />
            <Stat icon={<GraduationCap size={18} />} label="Black Belts" value={stats?.black} onClick={() => navigate("/students?filter=black")} />
            <Stat icon={<Award size={18} />} label="Ready to Test" value={stats?.permissionToTest} accent onClick={() => navigate("/students?filter=ptt")} />
            <Stat icon={<CalendarDays size={18} />} label="Upcoming Events" value={stats?.upcomingEvents} onClick={() => navigate("/events")} />
            <Stat icon={<Sparkles size={18} />} label="On Trial" value={stats?.onTrial} onClick={() => navigate("/trials")} />
          </div>

          {alerts && (alerts.trialsEndingSoon.length > 0 || alerts.recurringAbsences.length > 0) && (
            <div className="mt-8">
              <h2 className="mb-3 text-lg font-semibold tracking-tight">Alerts</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {alerts.trialsEndingSoon.length > 0 && (
                  <AlertCard title="Trials ending soon">
                    {alerts.trialsEndingSoon.map((a) => (
                      <AlertRow key={a.id} onClick={() => navigate("/trials")} name={a.name}
                        detail={`${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left`} tone="amber" />
                    ))}
                  </AlertCard>
                )}
                {alerts.recurringAbsences.length > 0 && (
                  <AlertCard title={`Recurring absences (${alerts.recurringAbsences.length})`}>
                    {alerts.recurringAbsences.slice(0, 10).map((a) => (
                      <AlertRow key={a.id} onClick={() => navigate("/students")} name={a.name}
                        detail={`last seen ${prettyDate(a.lastPresent)}`} />
                    ))}
                    {alerts.recurringAbsences.length > 10 && (
                      <div className="px-3 py-2 text-xs text-[var(--color-fg-muted)]">+{alerts.recurringAbsences.length - 10} more</div>
                    )}
                  </AlertCard>
                )}
              </div>
            </div>
          )}

          <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight">Upcoming events</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-fg-muted)]">
              No upcoming events scheduled.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-sm">
                <tbody>
                  {upcoming.map((e) => (
                    <tr key={e.id} onClick={() => navigate("/events")} className="cursor-pointer border-t border-[var(--color-border)] first:border-t-0 hover:bg-[var(--color-surface-2)]">
                      <td className="px-4 py-3 font-medium">{e.name}</td>
                      <td className="px-4 py-3 text-[var(--color-fg-muted)]">{e.eventType}</td>
                      <td className="px-4 py-3 text-right">{prettyDate(e.eventDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function AlertCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium">{title}</div>
      <div className="max-h-64 overflow-auto">{children}</div>
    </div>
  );
}

function AlertRow({ name, detail, tone, onClick }: { name: string; detail: string; tone?: "amber"; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 border-t border-[var(--color-border)] px-3 py-2 text-left text-sm first:border-t-0 hover:bg-[var(--color-surface-2)]">
      <span>{name}</span>
      <span className={`text-xs ${tone === "amber" ? "text-amber-600" : "text-[var(--color-fg-muted)]"}`}>{detail}</span>
    </button>
  );
}

function Stat({ icon, label, value, accent, onClick }: {
  icon: React.ReactNode; label: string; value: number | undefined; accent?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`rounded-lg border p-5 text-left transition enabled:hover:border-[var(--color-brand)] enabled:hover:shadow-sm ${accent ? "border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5" : "border-[var(--color-border)] bg-[var(--color-surface-2)]"}`}>
      <div className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
        <span className={accent ? "text-[var(--color-brand)]" : ""}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value ?? "—"}</div>
    </button>
  );
}
