import { formatEther, formatUnits } from "ethers";

export function reportTransactionCost(label, receipt) {
  const gasUsed = receipt.gasUsed;
  const gasPrice = receipt.gasPrice ?? 0n;
  const cost = gasUsed * gasPrice;
  console.log(`${label}: ${gasUsed} gas × ${formatUnits(gasPrice, "gwei")} gwei = ${formatEther(cost)} ETH`);
  const ethUsdPrice = Number(process.env.ETH_USD_PRICE || 0);
  const costUsd = ethUsdPrice > 0 ? Number(formatEther(cost)) * ethUsdPrice : null;
  return { label, gasUsed: gasUsed.toString(), gasPriceWei: gasPrice.toString(), costWei: cost.toString(), costEth: formatEther(cost), costUsd };
}

export function reportTotalCost(costs) {
  const total = costs.reduce((sum, cost) => sum + BigInt(cost.costWei), 0n);
  console.log(`Total on-chain cost: ${formatEther(total)} ETH`);
  return { totalWei: total.toString(), totalEth: formatEther(total) };
}
