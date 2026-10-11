import { Suspense } from "react";
import LineageScreen from "@/components/board/LineageScreen";

export default function LineagePage() {
  // ?sid= is read on the client; Suspense keeps the static export happy
  return (
    <Suspense>
      <LineageScreen />
    </Suspense>
  );
}
