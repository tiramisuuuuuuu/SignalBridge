import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalBridge",
  description: "A location-based safety and local-news assistant",
};

// Runs before paint so the saved/system theme applies without a flash.
const themeScript = `try{var t=localStorage.getItem("signalbridge.theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
