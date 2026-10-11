import { Suspense } from "react";
import ApprovalsScreen from "@/components/rally/ApprovalsScreen";

export default function ApprovalsPage() {
  // ApprovalsScreen reads ?id= with useSearchParams
  return (
    <Suspense>
      <ApprovalsScreen />
    </Suspense>
  );
}
