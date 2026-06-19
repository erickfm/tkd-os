import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/students", label: "Students" },
  { to: "/attendance", label: "Attendance" },
  { to: "/events", label: "Events" },
  { to: "/starter-courses", label: "Starter Courses" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <div className="px-5 py-5">
          <div className="text-lg font-semibold tracking-tight">TKD OS</div>
          <div className="text-xs text-[var(--color-fg-muted)]">
            Dojang Manager
          </div>
        </div>
        <nav className="px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "block rounded-md px-3 py-2 text-sm",
                  isActive
                    ? "bg-[var(--color-surface-3)] text-[var(--color-fg)] font-medium"
                    : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)]",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
