import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recovery Accountability Dashboard",
  description: "Monorepo scaffold dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
