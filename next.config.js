/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["geotiff"],
};

module.exports = nextConfig;
