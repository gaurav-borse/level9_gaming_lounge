"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Scannable UPI QR. Rendered black on white so every phone camera reads it. */
export function UpiQr({ link, size = 200 }: { link: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { margin: 2, width: size, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [link, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="UPI payment QR code" className="rounded-lg" /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-raised" />;
}
