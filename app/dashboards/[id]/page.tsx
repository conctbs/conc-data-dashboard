import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardViewPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DashboardView dashboardId={id} />;
}
