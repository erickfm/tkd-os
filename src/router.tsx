import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { DashboardPage } from "@/pages/Dashboard";
import { StudentsPage } from "@/pages/Students";
import { AttendancePage } from "@/pages/Attendance";
import { EventsPage } from "@/pages/Events";
import { StarterCoursesPage } from "@/pages/StarterCourses";
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
      { path: "events", element: <EventsPage /> },
      { path: "starter-courses", element: <StarterCoursesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
