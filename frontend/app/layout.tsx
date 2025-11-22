import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeScript } from "./theme-script";

export const metadata: Metadata = {
  title: "Smart Vehicle Repairs",
  description: "Comprehensive vehicle repair and workshop management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
