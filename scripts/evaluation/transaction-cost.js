import { formatEther, formatUnits } from "ethers";

export function reportTransactionCost(label, receipt) {
  const gasUsed = receipt.gasUsed;
  const gasPrice = receipt.gasPrice ?? 0n;
  const cost = gasUsed * gasPrice;
  console.log(`${label}: ${gasUsed} gas × ${formatUnits(gasPrice, "gwei")} gwei = ${formatEther(cost)} ETH`);
  return cost;
}

export function reportTotalCost(costs) {
  const total = costs.reduce((sum, cost) => sum + cost, 0n);
  console.log(`Total on-chain cost: ${formatEther(total)} ETH`);
}
