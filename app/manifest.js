export default function manifest() {
  return {
    id: "/",
    name: "MKL Énergies CRM",
    short_name: "MKL CRM",
    description: "Le CRM opérationnel de MKL Énergies — prospects, devis et terrain.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#405fae",
    lang: "fr",
    icons: [
      { src: "/icons/mkl-app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/mkl-app-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/mkl-app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
