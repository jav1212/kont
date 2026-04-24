import type { Metadata, Viewport } from "next";
import { Darker_Grotesque, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./provider";
import { Toaster } from "sonner";

const darkerGrotesque = Darker_Grotesque({
  variable: "--font-darker-grotesque",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0C14" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://kontave.com"),
  title: {
    default:  "Kontave — Software contable para Venezuela",
    template: "%s | Kontave",
  },
  description: "Kontave es el software contable todo-en-uno para contadores y empresas en Venezuela: contabilidad, nómina quincenal, inventario con kardex, calendario SENIAT y herramientas gratuitas.",
  applicationName: "Kontave",
  keywords: [
    "Kontave",
    "kontave.com",
    "software contable Venezuela",
    "sistema contable Venezuela",
    "nómina Venezuela",
    "calendario SENIAT",
    "calculadora divisas BCV",
    "estatus SENIAT",
    "inventario kardex",
    "prestaciones sociales LOTTT",
    "contribuyentes especiales",
    "SaaS contable Venezuela",
  ],
  authors: [{ name: "Kontave" }],
  creator: "Kontave",
  publisher: "Kontave",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-512.png", sizes: "512x512" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kontave",
  },
  openGraph: {
    title:       "Kontave — Software contable para Venezuela",
    description: "Software contable todo-en-uno para Venezuela: contabilidad, nómina quincenal, inventario, calendario SENIAT y herramientas gratuitas para contadores.",
    url:         "https://kontave.com",
    siteName:    "Kontave",
    type:        "website",
    locale:      "es_VE",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Kontave — Software contable para Venezuela",
    description: "Software contable todo-en-uno para Venezuela: contabilidad, nómina, inventario, calendario SENIAT y más.",
  },
  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet":       -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    email:     false,
    address:   false,
  },
};

const brandJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://kontave.com/#organization",
      name: "Kontave",
      alternateName: ["Kontave.", "Konta", "Kontave Venezuela"],
      url: "https://kontave.com",
      logo: {
        "@type": "ImageObject",
        url: "https://kontave.com/icon-512.png",
        width: 512,
        height: 512,
      },
      description:
        "Software contable todo-en-uno para contadores y empresas en Venezuela: contabilidad, nómina, inventario, calendario SENIAT y herramientas gratuitas.",
      areaServed: {
        "@type": "Country",
        name: "Venezuela",
      },
      knowsLanguage: "es-VE",
      sameAs: [
        // Agregar aquí las redes sociales cuando estén creadas:
        // "https://www.linkedin.com/company/kontave",
        // "https://twitter.com/kontave",
        // "https://www.instagram.com/kontave",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://kontave.com/#website",
      url: "https://kontave.com",
      name: "Kontave",
      description: "Software contable para Venezuela",
      publisher: { "@id": "https://kontave.com/#organization" },
      inLanguage: "es-VE",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://kontave.com/#software",
      name: "Kontave",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "AccountingSoftware",
      operatingSystem: "Web",
      url: "https://kontave.com",
      publisher: { "@id": "https://kontave.com/#organization" },
      description:
        "Software contable todo-en-uno para Venezuela con módulos de contabilidad, nómina, inventario y documentos, más herramientas gratuitas (divisas BCV, calendario SENIAT, estatus de portales).",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      inLanguage: "es-VE",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Brand entity (Organization + WebSite + SoftwareApplication) for Google knowledge graph */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(brandJsonLd) }}
        />
        {/* Anti-flash: apply theme class before paint */}
        <script dangerouslySetInnerHTML={{
          __html: `
          try {
            var t = localStorage.getItem('kont-theme');
            if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            if (t === 'dark') document.documentElement.classList.add('dark');
          } catch(e) {}
        `}} />
      </head>
      <body className={`${darkerGrotesque.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface-1)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "13px",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
