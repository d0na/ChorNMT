import { formatEther, formatUnits } from "ethers";

export function reportTransactionCost(label, receipt) {
  const gasUsed = receipt.gasUsed;
  const gasPrice = receipt.gasPrice ?? 0n;
  const cost = gasUsed * gasPrice;
  console.log(`${label}: ${gasUsed} gas × ${formatUnits(gasPrice, "gwei")} gwei = ${formatEther(cost)} ETH`);
  return { label, gasUsed: gasUsed.toString(), gasPriceWei: gasPrice.toString(), costWei: cost.toString(), costEth: formatEther(cost) };
}

export function reportTotalCost(costs) {
  const total = costs.reduce((sum, cost) => sum + BigInt(cost.costWei), 0n);
  console.log(`Total on-chain cost: ${formatEther(total)} ETH`);
  return { totalWei: total.toString(), totalEth: formatEther(total) };
}
