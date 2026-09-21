set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/phase-gas.png"
set datafile separator comma
set style data histograms
set style fill solid
set grid ytics
set ylabel "Gas used"
set title "End-to-end experiment: gas by phase"
plot "evaluation/experiment-results.generated.csv" using 3:xtic(1) title "Gas"
