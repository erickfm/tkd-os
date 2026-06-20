import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, CalendarDays, GraduationCap, Sparkles, Users } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { getDashboardStats, listEvents, type DashboardStats } from "@/db/repos";
import type { EventRow } from "@/db/schema";
import { prettyDate, today } from "@/lib/format";

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcoming, setUpcoming] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, evs] = await Promise.all([getDashboardStats(), listEvents()]);
        setStats(s);
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
            <Stat icon={<Sparkles size={18} />} label="Active Courses" value={stats?.activeCourses} onClick={() => navigate("/starter-courses")} />
          </div>

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
