require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ||
  // Well-known Hardhat test key — only valid for local/hardhat networks
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        count: 10,
      },
    },
    localhost: { url: 'http://127.0.0.1:8545', chainId: 31337 },
    polygon_amoy: {
      url: process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
      chainId: 80002,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
    polygon_mumbai: {
      url: process.env.MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
      chainId: 80001,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
    polygon_mainnet: {
      url: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      chainId: 137,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      polygon:       process.env.POLYGONSCAN_API_KEY || '',
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || '',
    },
  },
  gasReporter: { enabled: true, currency: 'USD' },
  paths: { sources: './contracts', tests: './test', cache: './cache', artifacts: './artifacts' },
};
