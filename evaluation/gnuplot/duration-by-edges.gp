set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/duration-by-edges.png"
set datafile separator comma
set key outside
set grid
set xlabel "Number of sequence edges"
set ylabel "Total duration (ms)"
set title "Operation duration by graph size"
plot "metrics/measurements.generated.csv" using 8:3 every ::1 with points pt 7 ps 1.5 title "all operations"
