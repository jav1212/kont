import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: 512,
                    height: 512,
                    borderRadius: 96,
                    background: "#0891b2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: 20,
                    padding: 80,
                }}
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, width: "100%" }}>
                    <div style={{ width: 156, height: 156, borderRadius: 16, background: "rgba(255,255,255,0.95)" }} />
                    <div style={{ width: 156, height: 156, borderRadius: 16, background: "rgba(255,255,255,0.45)" }} />
                    <div style={{ width: 156, height: 156, borderRadius: 16, background: "rgba(255,255,255,0.45)" }} />
                    <div style={{ width: 156, height: 156, borderRadius: 16, background: "rgba(255,255,255,0.95)" }} />
                </div>
            </div>
        ),
        { ...size }
    );
}
