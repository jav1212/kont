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
                    borderRadius: 36,
                    background: "#0B0C14",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* K letter */}
                <span
                    style={{
                        fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
                        fontWeight: 900,
                        fontSize: 120,
                        color: "white",
                        lineHeight: 1,
                        letterSpacing: "-4px",
                        marginLeft: "-14px",
                        marginTop: "4px",
                    }}
                >
                    K
                </span>
                {/* Orange dot */}
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        background: "#FF4A18",
                        position: "absolute",
                        bottom: 20,
                        right: 20,
                    }}
                />
            </div>
        ),
        { ...size }
    );
}
