import { DashboardShell } from "@risitex/ui/components";
import { B2bSidebar } from "@/components/b2b/b2b-sidebar";
import { Guard } from "@/components/auth/route-guard";

export default function B2bLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard requirement="wholesale">
      <DashboardShell sidebar={<B2bSidebar />}>{children}</DashboardShell>
    </Guard>
  );
}
