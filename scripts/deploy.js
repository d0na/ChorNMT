import hre from "hardhat";

async function main() {
  const contractFactory = await hre.ethers.getContractFactory("BPMNChoreography");
  const contract = await contractFactory.deploy();

  await contract.waitForDeployment();

  console.log(`BPMNChoreography deployed to: ${contract.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
