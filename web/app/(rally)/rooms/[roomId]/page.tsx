import RoomScreen from "@/components/rally/RoomScreen";
import { ROOM_IDS } from "@/lib/rally/seed-ids";

// lets STATIC_EXPORT=1 prerender the seeded rooms
export function generateStaticParams() {
  return ROOM_IDS.map((roomId) => ({ roomId }));
}

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomScreen roomId={roomId} />;
}
