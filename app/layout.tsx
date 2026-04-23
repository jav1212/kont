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
    default:  "Konta — Nómina, Inventario y Contabilidad para Venezuela",
    template: "%s | Konta",
  },
  description: "Plataforma SaaS para contadores y empresas en Venezuela: nómina quincenal, inventario con kardex, contabilidad, calendario SENIAT y más.",
  applicationName: "Konta",
  keywords: [
    "nómina Venezuela",
    "software contable Venezuela",
    "calendario SENIAT",
    "inventario kardex",
    "prestaciones sociales",
    "LOTTT",
    "contribuyentes especiales",
    "SaaS contable",
  ],
  authors: [{ name: "Konta" }],
  creator: "Konta",
  publisher: "Konta",
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
    title: "Konta",
  },
  openGraph: {
    title:       "Konta — Nómina, Inventario y Contabilidad para Venezuela",
    description: "Plataforma SaaS para contadores y empresas en Venezuela: nómina quincenal, inventario con kardex, contabilidad y calendario SENIAT.",
    url:         "https://kontave.com",
    siteName:    "Konta",
    type:        "website",
    locale:      "es_VE",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Konta — Nómina, Inventario y Contabilidad para Venezuela",
    description: "Plataforma SaaS para contadores y empresas en Venezuela.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
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
