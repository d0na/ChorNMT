set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/phase-duration.png"
set datafile separator comma
set style data histograms
set style fill solid
set grid ytics
set ylabel "Duration (ms)"
set title "End-to-end experiment: duration by phase"
plot "evaluation/experiment-results.generated.csv" using 2:xtic(1) title "Duration"
