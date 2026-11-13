// The Polygon cost assumptions shared by the experiment protocol and the extended evaluation.
// Gas prices of a sensitivity analysis: assumptions to compare costs, not historical averages or
// official congestion thresholds. The reference rounds up a Polygon Gas Station reading.
export const GAS_STATION_READING_GWEI = 271;
export const GWEI_SCENARIOS = [
  [100, "Economical", "fees below the reading consulted"],
  [300, "Reference", `the Polygon Gas Station reading of about ${GAS_STATION_READING_GWEI} gwei, rounded up`],
  [1000, "Costly", "fees markedly above the reading, to see how far the costs grow"]
];
export const REFERENCE_GWEI = GWEI_SCENARIOS[1][0];
// USD = gas × gas price in gwei × 10⁻⁹ × POL/USD.
export const usdAt = (gas, gwei, polUsdPrice) => Number(gas) * gwei / 1e9 * polUsdPrice;
