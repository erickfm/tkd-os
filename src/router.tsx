import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { DashboardPage } from "@/pages/Dashboard";
import { StudentsPage } from "@/pages/Students";
import { AttendancePage } from "@/pages/Attendance";
import { TestingCyclePage } from "@/pages/TestingCycle";
import { EventsPage } from "@/pages/Events";
import { TrialsPage } from "@/pages/Trials";
import { SettingsPage } from "@/pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "students", element: <StudentsPage /> },
      { path: "attendance", element: <AttendancePage /> },
      { path: "testing-cycle", element: <TestingCyclePage /> },
      { path: "events", element: <EventsPage /> },
      { path: "trials", element: <TrialsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
