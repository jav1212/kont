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
                    borderRadius: 88,
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
                        fontSize: 340,
                        color: "white",
                        lineHeight: 1,
                        letterSpacing: "-10px",
                        marginLeft: "-40px",
                        marginTop: "10px",
                    }}
                >
                    K
                </span>
                {/* Orange dot */}
                <div
                    style={{
                        width: 96,
                        height: 96,
                        borderRadius: 48,
                        background: "#FF4A18",
                        position: "absolute",
                        bottom: 60,
                        right: 56,
                    }}
                />
            </div>
        ),
        { ...size }
    );
}
