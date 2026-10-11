"use client";

import { QRCodeSVG } from "qrcode.react";
import { useBoard } from "./BoardProvider";

export default function PhoneCard() {
  const { boardUrl } = useBoard();
  if (!boardUrl) return null;
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex-none rounded-[10px] bg-white p-2">
        <QRCodeSVG value={boardUrl} size={96} />
      </div>
      <div className="text-[13px] text-ink-2">
        Scan to steer the team from your phone. Phones open straight to the message screen.
        <div className="mt-1 font-code text-[11px] break-all text-ink">{boardUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
      </div>
    </div>
  );
}
