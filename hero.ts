// hero.ts
import { heroui } from "@heroui/react";

export default heroui({
    themes: {
        light: {
            colors: {
                primary: {
                    50:      "#ECFEFF",
                    100:     "#CFFAFE",
                    200:     "#A5F3FC",
                    300:     "#67E8F9",
                    400:     "#22D3EE",
                    500:     "#0E7490",   // 5.36:1 on white — WCAG AA
                    600:     "#155E75",   // 7.27:1 on white — WCAG AAA
                    700:     "#164E63",
                    800:     "#0C3549",
                    900:     "#082130",
                    DEFAULT: "#0E7490",
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
                    50:      "#082130",
                    100:     "#0C3549",
                    200:     "#164E63",
                    300:     "#155E75",
                    400:     "#0891B2",
                    500:     "#22D3EE",   // 7.16:1 on dark surface — excellent
                    600:     "#67E8F9",
                    700:     "#A5F3FC",
                    800:     "#CFFAFE",
                    900:     "#ECFEFF",
                    DEFAULT: "#22D3EE",
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
