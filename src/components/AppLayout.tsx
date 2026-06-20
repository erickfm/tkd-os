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
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5">
        <img
          src="/logo.png"
          alt="Ojai Valley Taekwondo Academy"
          className="h-10 w-10 shrink-0 rounded-full bg-white object-cover ring-1 ring-[var(--color-border)]"
        />
        <div className="font-serif text-xl leading-none tracking-tight">
          <span className="text-[var(--color-brand)]">TKD</span> OS
        </div>
        <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />
        <div className="text-sm text-[var(--color-fg-muted)]">
          Ojai Valley Taekwondo Academy
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <nav className="px-2 py-4">
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
    </div>
  );
}
