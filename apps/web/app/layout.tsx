import type { Metadata } from "next";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/codelit/tooltip";
import { Toaster } from "@/components/ui/sonner";
import Scripts from "./scripts";

const hankenGrotesk = Hanken_Grotesk({
    subsets: ["latin"],
    variable: "--font-sans",
});
const splineSansMono = Spline_Sans_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: "Medialit",
    description: "",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            data-product="medialit"
            className={cn(
                "font-sans",
                hankenGrotesk.variable,
                splineSansMono.variable,
            )}
        >
            <head></head>
            <body className="antialiased">
                <TooltipProvider>
                    <SidebarProvider>
                        <AppSidebar />
                        <SidebarInset className="min-w-0">
                            <header className="flex h-16 w-full shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                                <div className="flex items-center gap-2 px-4">
                                    <SidebarTrigger className="-ml-1" />
                                </div>
                            </header>
                            <main className="mx-auto w-full max-w-[1024px] min-h-screen">
                                <div className="px-2 py-8 ">{children}</div>
                            </main>
                        </SidebarInset>
                    </SidebarProvider>
                    <Toaster />
                    {/* <Footer /> */}
                    <Scripts />
                </TooltipProvider>
            </body>
        </html>
    );
}
