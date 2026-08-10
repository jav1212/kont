import { ImageResponse } from "next/og";

export const alt = "Kontave — software contable para Venezuela";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
    return new ImageResponse(
        <div style={{ background: "#0B0C14", color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: "72px", width: "100%", height: "100%" }}>
            <div style={{ color: "#FF4A18", fontSize: 28, letterSpacing: 8, textTransform: "uppercase" }}>KONTAVE</div>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, marginTop: 28, maxWidth: 900 }}>La consola contable para Venezuela.</div>
            <div style={{ color: "#A4A6B0", fontSize: 30, marginTop: 28 }}>Nómina · Inventario · Contabilidad · SENIAT</div>
        </div>,
        size,
    );
}
