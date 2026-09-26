import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { DashboardPage } from "@/pages/Dashboard";
import { StudentsPage } from "@/pages/Students";
import { TestingProgressPage } from "@/pages/TestingProgress";
import { AttendancePage } from "@/pages/Attendance";
import { TestingCyclePage } from "@/pages/TestingCycle";
import { EventsPage } from "@/pages/Events";
import { TrialsPage } from "@/pages/Trials";
import { InventoryPage } from "@/pages/Inventory";
import { StatisticsPage } from "@/pages/Statistics";
import { ReportsPage } from "@/pages/Reports";
import { AttendanceReportPage } from "@/pages/reports/AttendanceReport";
import { RetentionReportPage } from "@/pages/reports/RetentionReport";
import { TrialReportPage } from "@/pages/reports/TrialReport";
import { PyramidReportPage } from "@/pages/reports/PyramidReport";
import { MembershipReportPage } from "@/pages/reports/MembershipReport";
import { TimeInRankReportPage } from "@/pages/reports/TimeInRankReport";
import { DemographicsReportPage } from "@/pages/reports/DemographicsReport";
import { EnrollmentReportPage } from "@/pages/reports/EnrollmentReport";
import { ClassSlotsReportPage } from "@/pages/reports/ClassSlotsReport";
import { SettingsPage } from "@/pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "students", element: <StudentsPage /> },
      { path: "testing-progress", element: <TestingProgressPage /> },
      { path: "attendance", element: <AttendancePage /> },
      { path: "testing-cycle", element: <TestingCyclePage /> },
      { path: "events", element: <EventsPage /> },
      { path: "trials", element: <TrialsPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "reports/attendance", element: <AttendanceReportPage /> },
      { path: "reports/retention", element: <RetentionReportPage /> },
      { path: "reports/trials", element: <TrialReportPage /> },
      { path: "reports/pyramid", element: <PyramidReportPage /> },
      { path: "reports/membership", element: <MembershipReportPage /> },
      { path: "reports/time-in-rank", element: <TimeInRankReportPage /> },
      { path: "reports/demographics", element: <DemographicsReportPage /> },
      { path: "reports/enrollment", element: <EnrollmentReportPage /> },
      { path: "reports/class-slots", element: <ClassSlotsReportPage /> },
      { path: "statistics", element: <StatisticsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
