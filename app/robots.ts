import type { MetadataRoute } from "next";

const siteUrl = "https://kontave.com";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow:     ["/"],
                disallow:  [
                    "/admin",
                    "/admin/",
                    "/api/",
                    "/payroll",
                    "/inventory",
                    "/companies",
                    "/billing",
                    "/documents",
                    "/settings",
                    "/tools",
                    "/profile",
                    "/sign-in",
                    "/sign-up",
                    "/forgot-password",
                    "/reset-password",
                    "/resend-confirmation",
                    "/accept-invite",
                    "/herramientas/calendario-seniat/embed",
                ],
            },
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
        host:    siteUrl,
    };
}
