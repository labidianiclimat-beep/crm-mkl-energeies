/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["geotiff"],
  outputFileTracingIncludes: {
    "/api/devis/[id]/send": [
      "./public/mkl-energies.png",
      "./public/rge-qualifelec.png",
      "./public/cgv/cgv-mkl-energies.pdf",
    ],
    "/api/devis/[id]/signature": [
      "./public/mkl-energies.png",
      "./public/rge-qualifelec.png",
      "./public/cgv/cgv-mkl-energies.pdf",
    ],
    "/api/sav/[id]/intervention-sheet": [
      "./public/mkl-energies.png",
    ],
  },
};

module.exports = nextConfig;
