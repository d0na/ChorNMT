# Evaluation toolkit

Each `import:asset`, `modify:asset`, and `render:asset` execution writes a JSON report under `metrics/`. The report records wall-clock duration and model/delta size: roles, nodes, tasks, gateways, sequence edges, and messages. On-chain commands also print receipt-derived gas and ETH cost in their console output.

For a complete fresh experiment, start the local operations environment in one terminal and run this in another:

```bash
npm run evaluate:paper
```

The command deploys its own asset, executes import → baseline render → delta modification → final render, clears only previous `metrics/*.generated.*` artifacts, creates the CSV and figures, and writes `evaluation/experiment-summary.generated.md`.

After collecting repeated runs, create a CSV file and figures:

```bash
node scripts/evaluation/export-metrics-csv.js
mkdir -p evaluation/figures
gnuplot evaluation/gnuplot/duration-by-nodes.gp
gnuplot evaluation/gnuplot/duration-by-edges.gp
```

The CSV also contains total gas used and ETH cost for each import or delta operation, so the gas template uses the same generated CSV:

```bash
gnuplot evaluation/gnuplot/gas-by-changed-nodes.gp
```

The generated CSV, metric reports, and PNG figures are intentionally local artifacts. For publication, repeat each scenario, aggregate median/mean/standard deviation, and report the network, gas price, compiler optimizer settings, Node.js version, and hardware.
