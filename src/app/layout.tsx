import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlashMail | Instant Temp Mail on flash-mail.vaibhavs-h.xyz",
  description: "Lightning-Fast, Self-Hosted Real-Time Disposable Temporary Email Service for flash-mail.vaibhavs-h.xyz",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-[#080c14] text-slate-100 selection:bg-blue-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
