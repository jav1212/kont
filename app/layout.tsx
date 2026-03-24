import type { Metadata, Viewport } from "next";
import { Darker_Grotesque, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./provider";

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
    { media: "(prefers-color-scheme: dark)",  color: "#0B0C14" },
  ],
};

export const metadata: Metadata = {
  title: "Konta",
  description: "Sistema de gestión empresarial — Venezuela",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico",    sizes: "32x32",    type: "image/x-icon"  },
      { url: "/icon-32.png",    sizes: "32x32",    type: "image/png"     },
      { url: "/icon-512.png",   sizes: "512x512",  type: "image/png"     },
      { url: "/icons/icon.svg",                    type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-512.png", sizes: "512x512" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Konta",
  },
  openGraph: {
    title: "Konta",
    description: "Sistema de gestión empresarial — Venezuela",
    type: "website",
    locale: "es_VE",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
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
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('kont-theme');
            if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            if (t === 'dark') document.documentElement.classList.add('dark');
          } catch(e) {}
        `}} />
      </head>
      <body className={`${darkerGrotesque.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
