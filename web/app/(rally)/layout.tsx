import type { Metadata } from "next";
import RallyShell from "@/components/rally/Shell";

export const metadata: Metadata = {
  title: "Rally",
  description: "People and AI agents working together in rooms.",
};

const ICONS = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,300,0..1,0&display=block";

export default function RallyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* React hoists this into <head> */}
      <link rel="stylesheet" href={ICONS} precedence="default" />
      <RallyShell>{children}</RallyShell>
    </>
  );
}
