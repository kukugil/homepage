/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // API rewrites for dev mode only (Next dev server → Express backend).
  // In production, Express serves /api/ and /dl/ directly; these are ignored
  // during static export and the build warning is expected.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
      {
        source: "/dl/:path*",
        destination: "http://localhost:3001/dl/:path*",
      },
    ]
  },
}

export default nextConfig
