set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/phase-gas.png"
set datafile separator comma
set style data histograms
set style fill solid
set grid ytics
unset key
set ylabel "Gas used"
set title "On-chain gas by experiment phase (zero = local-only phase)"
plot "evaluation/experiment-results.generated.csv" using 3:xtic(1) lc rgb "#C74E45" notitle
