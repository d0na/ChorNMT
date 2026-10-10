# Median wall-clock duration by experiment phase, with min-max bars. Data: phase,median,min,max.
# Called by scripts/experiment/charts.js with datafile, outbase, and runs set.
set datafile separator comma
set style fill solid border -1
set boxwidth 0.6
set grid ytics
unset key
set ylabel "Duration (ms)"
set xtics nomirror
set yrange [0:*]
set title sprintf("Duration by experiment phase (median, min-max over %d runs)", runs)
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 0:2:xtic(1) with boxes lc rgb "#2878B5", '' using 0:2:3:4 with yerrorbars lc rgb "#2F4F6F" pt 0
