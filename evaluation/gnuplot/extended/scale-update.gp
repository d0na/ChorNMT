# Gas of an update of one task by the tasks of the model, under the two Creator policies.
# Data: tasks,origin,defaultGas,constrainedGas (origin: minted or grown by updates).
# Called by scripts/experiment/extended-charts.js with datafile and outbase set.
set datafile separator comma
set grid
set key outside top center horizontal
set xlabel "Tasks in the model"
set ylabel "Gas used"
set format y "%.0f"
set xrange [0:*]
set yrange [0:*]
set title "Updating one task by the size of the model"
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 1:4 with linespoints pt 7 ps 1.6 lw 2 lc rgb "#C74E45" title "constrained Creator policy", '' using 1:3 with linespoints pt 5 ps 1.4 lw 2 lc rgb "#2878B5" title "default Creator policy"
