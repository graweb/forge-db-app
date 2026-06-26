import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge DB",
  description: "Tela inicial para conexão e gerenciamento de bancos de dados.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
