import { Suspense } from "react";
import { DashboardBuilder } from "@/components/builder/dashboard-builder";
import { LoadingState } from "@/components/shared/states";

export default function BuilderPage() {
  return (
    <Suspense fallback={<LoadingState label="Preparing builder..." />}>
      <DashboardBuilder />
    </Suspense>
  );
}
