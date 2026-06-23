import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/students", label: "Students" },
  { to: "/attendance", label: "Attendance" },
  { to: "/testing-cycle", label: "Testing Cycle" },
  { to: "/events", label: "Events" },
  { to: "/trials", label: "Trials" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  return (
    <div className="flex h-full flex-col">
      <header
        data-tauri-drag-region
        className="flex h-16 shrink-0 select-none items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] pl-5"
      >
        <img
          src="/logo.png"
          alt="Ojai Valley Taekwondo Academy"
          className="pointer-events-none h-10 w-10 shrink-0 rounded-full bg-white object-cover ring-1 ring-[var(--color-border)]"
        />
        <div className="pointer-events-none font-serif text-xl leading-none tracking-tight">
          <span className="text-[var(--color-brand)]">TKD</span> OS
        </div>
        <div className="pointer-events-none mx-1 h-6 w-px bg-[var(--color-border)]" />
        <div className="pointer-events-none text-sm text-[var(--color-fg-muted)]">
          Ojai Valley Taekwondo Academy
        </div>
        <WindowControls />
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

function WindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => win.isMaximized().then(setMaximized));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [win]);

  const btn =
    "inline-flex h-full w-12 items-center justify-center text-[var(--color-fg-muted)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)]";

  return (
    <div className="ml-auto flex h-full items-stretch">
      <button className={btn} onClick={() => win.minimize()} aria-label="Minimize">
        <Minus size={16} />
      </button>
      <button className={btn} onClick={() => win.toggleMaximize()} aria-label={maximized ? "Restore" : "Maximize"}>
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button
        className={`${btn} hover:bg-red-600 hover:text-white`}
        onClick={() => win.close()}
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
