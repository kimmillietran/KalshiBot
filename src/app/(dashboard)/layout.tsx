import { AppShell } from "@/components/layout/AppShell";
import { DashboardProviders } from "@/providers/DashboardProviders";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardProviders>
      <AppShell>{children}</AppShell>
    </DashboardProviders>
  );
}
