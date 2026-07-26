import "./globals.css";
import CrmAccessGate from "./components/crm-access-gate";

export const metadata = {
  title: "MKL Énergies CRM",
  description: "Le CRM opérationnel de MKL Énergies",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body><CrmAccessGate>{children}</CrmAccessGate></body>
    </html>
  );
}
