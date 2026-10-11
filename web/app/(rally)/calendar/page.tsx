import { Suspense } from "react";
import CalendarScreen from "@/components/rally/CalendarScreen";

export default function CalendarPage() {
  // CalendarScreen reads ?date= and ?event= with useSearchParams
  return (
    <Suspense>
      <CalendarScreen />
    </Suspense>
  );
}
