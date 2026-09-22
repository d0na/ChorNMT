import hardhatEthers from "@nomicfoundation/hardhat-ethers";

export default {
  plugins: [hardhatEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      transactionGasCap: false
    }
  }
};
