import { redirect } from "next/navigation";
import { DEFAULT_ROOM } from "@/lib/rally/seed-ids";

export default function RoomsIndex() {
  redirect(`/rooms/${DEFAULT_ROOM}`);
}
