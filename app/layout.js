import "./globals.css";
import CrmAccessGate from "./components/crm-access-gate";
import DecimalComma from "./components/decimal-comma";
import { PwaRegister } from "./components/install-app-button";

export const viewport = {
  themeColor: "#405fae",
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  title: "MKL Énergies CRM",
  description: "Le CRM opérationnel de MKL Énergies",
  applicationName: "MKL CRM",
  appleWebApp: {
    capable: true,
    title: "MKL CRM",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/mkl-app-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/mkl-app-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <PwaRegister />
        <DecimalComma />
        <CrmAccessGate>{children}</CrmAccessGate>
      </body>
    </html>
  );
}
