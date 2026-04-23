// hero.ts
import { heroui } from "@heroui/react";

export default heroui({
    themes: {
        light: {
            colors: {
                primary: {
                    50:      "#FFF4F0",
                    100:     "#FFE5DB",
                    200:     "#FFC9B5",
                    300:     "#FFA085",
                    400:     "#FF7450",
                    500:     "#D93A10",   // 4.58:1 on white — WCAG AA
                    600:     "#B22C0B",   // 6.05:1 on white — WCAG AAA
                    700:     "#8C2208",
                    800:     "#661805",
                    900:     "#3D0F03",
                    DEFAULT: "#D93A10",
                    foreground: "#FFFFFF",
                },
                danger: {
                    DEFAULT: "#B91C1C",   // red-700 — 5.93:1 on white
                    foreground: "#FFFFFF",
                },
                success: {
                    DEFAULT: "#047857",   // emerald-700 — 5.59:1 on white
                    foreground: "#FFFFFF",
                },
                warning: {
                    DEFAULT: "#92400E",   // amber-800 — 7.48:1 on white
                    foreground: "#FFFFFF",
                },
            },
        },
        dark: {
            colors: {
                primary: {
                    50:      "#3D0F03",
                    100:     "#661805",
                    200:     "#8C2208",
                    300:     "#B22C0B",
                    400:     "#D93A10",
                    500:     "#FF4A18",   // 4.62:1 on surface-1 dark (AA, narrow margin). 3.43:1 on surface-2 — avoid as text on surface-2/3.
                    600:     "#FF7450",
                    700:     "#FFA085",
                    800:     "#FFC9B5",
                    900:     "#FFF4F0",
                    DEFAULT: "#FF4A18",
                    foreground: "#07080F",
                },
                danger: {
                    DEFAULT: "#F87171",   // red-400 — 5.2:1 on dark surface
                    foreground: "#07080F",
                },
                success: {
                    DEFAULT: "#34D399",   // emerald-400 — 6.6:1 on dark surface
                    foreground: "#07080F",
                },
                warning: {
                    DEFAULT: "#FCD34D",   // amber-300 — 8.1:1 on dark surface
                    foreground: "#07080F",
                },
            },
        },
    },
});
