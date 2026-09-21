# Evaluation toolkit

Each `import:asset`, `modify:asset`, and `render:asset` execution writes a JSON report under `metrics/`. The report records wall-clock duration and model/delta size: roles, nodes, tasks, gateways, sequence edges, and messages. On-chain commands also print receipt-derived gas and ETH cost in their console output.

After collecting repeated runs, create a CSV file and figures:

```bash
node scripts/export-metrics-csv.js
mkdir -p evaluation/figures
gnuplot evaluation/gnuplot/duration-by-nodes.gp
gnuplot evaluation/gnuplot/duration-by-edges.gp
```

For gas scalability, save repeated `setNodes` receipt values in `evaluation/gas-results.csv` with this header and run the third template:

```csv
changedNodes,gasUsed
1,0
```

```bash
gnuplot evaluation/gnuplot/gas-by-changed-nodes.gp
```

The generated CSV, metric reports, and PNG figures are intentionally local artifacts. For publication, repeat each scenario, aggregate median/mean/standard deviation, and report the network, gas price, compiler optimizer settings, Node.js version, and hardware.
