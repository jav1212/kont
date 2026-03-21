import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: 180,
                    height: 180,
                    borderRadius: 40,
                    background: "#0891b2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 28,
                }}
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, width: "100%" }}>
                    <div style={{ width: 54, height: 54, borderRadius: 6, background: "rgba(255,255,255,0.95)" }} />
                    <div style={{ width: 54, height: 54, borderRadius: 6, background: "rgba(255,255,255,0.45)" }} />
                    <div style={{ width: 54, height: 54, borderRadius: 6, background: "rgba(255,255,255,0.45)" }} />
                    <div style={{ width: 54, height: 54, borderRadius: 6, background: "rgba(255,255,255,0.95)" }} />
                </div>
            </div>
        ),
        { ...size }
    );
}
