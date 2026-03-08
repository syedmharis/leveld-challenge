import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Contract Risk Extractor",
  description: "Analyze contract clauses for risk using Gemini AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistMono.variable} antialiased h-screen overflow-hidden`}>
        <TooltipProvider>
          <SidebarProvider className="h-full">
            <AppSidebar />
            <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
              <div className="flex items-center px-4 py-2 border-b shrink-0">
                <SidebarTrigger />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {children}
              </div>
            </main>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
