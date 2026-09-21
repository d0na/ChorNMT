set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/gas-by-changed-nodes.png"
set datafile separator comma
set key outside
set grid
set xlabel "Nodes in measured operation"
set ylabel "Gas used"
set title "Delta update gas by changed-node count"
plot "metrics/measurements.generated.csv" using 5:10 every ::1 with points pt 7 ps 1.5 title "on-chain writes"
