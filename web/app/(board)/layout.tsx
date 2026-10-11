import BoardProvider from "@/components/board/BoardProvider";
import BoardShell from "@/components/board/BoardShell";

const ICONS = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,300,0..1,0&display=block";

/** Live, Results, Lineage and Schedule share one provider, so one EventSource serves all four screens. */
export default function BoardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* React hoists this into <head> */}
      <link rel="stylesheet" href={ICONS} precedence="default" />
      <BoardProvider>
        <BoardShell>{children}</BoardShell>
      </BoardProvider>
    </>
  );
}
