/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['@skynet/p2p-mesh-network', '@skynet/core-wasm-engine'],
};

module.exports = nextConfig;
