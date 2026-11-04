import QRCode from "qrcode";

/** Server-side SVG QR (no client libraries, no external requests). */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#111111", light: "#ffffff" } });
}
