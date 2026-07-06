import hre from "hardhat";
import { NonceManager } from "ethers";

async function main() {
  const [baseDeployer] = await hre.ethers.getSigners();
  const deployer = new NonceManager(baseDeployer);
  const deployerAddress = await deployer.getAddress();
  const creatorPolicyFactory = await hre.ethers.getContractFactory(
    "contracts/choreography/CreatorSmartPolicy.sol:CreatorSmartPolicy",
    deployer
  );
  const holderPolicyFactory = await hre.ethers.getContractFactory(
    "contracts/choreography/HolderSmartPolicy.sol:HolderSmartPolicy",
    deployer
  );
  const nmtFactory = await hre.ethers.getContractFactory(
    "contracts/choreography/ChoreographyNMT.sol:ChoreographyNMT",
    deployer
  );

  const creatorPolicy = await creatorPolicyFactory.deploy();
  const holderPolicy = await holderPolicyFactory.deploy();
  const nmt = await nmtFactory.deploy();

  await creatorPolicy.waitForDeployment();
  await holderPolicy.waitForDeployment();
  await nmt.waitForDeployment();

  const [assetAddress, tokenId] = await nmt.mint.staticCall(
    deployerAddress,
    creatorPolicy.target,
    holderPolicy.target
  );
  const mintTx = await nmt.mint(
    deployerAddress,
    creatorPolicy.target,
    holderPolicy.target
  );
  await mintTx.wait();

  console.log(`ChoreographyNMT deployed to: ${nmt.target}`);
  console.log(`CreatorSmartPolicy deployed to: ${creatorPolicy.target}`);
  console.log(`HolderSmartPolicy deployed to: ${holderPolicy.target}`);
  console.log(`ChoreographyMutableAsset minted at: ${assetAddress}`);
  console.log(`Token ID: ${tokenId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
