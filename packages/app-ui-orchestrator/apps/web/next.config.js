/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: [
    '@skynet/core-wasm-engine',
    '@skynet/p2p-mesh-network',
    '@skynet/inference-runtime',
    '@skynet/blockchain-client',
  ],
};

module.exports = nextConfig;
