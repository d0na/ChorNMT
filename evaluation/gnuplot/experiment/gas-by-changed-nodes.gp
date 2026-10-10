# Gas of every setNodes transaction by the number of nodes it writes. Data: key,nodes,allowedGas,deniedGas (NaN when absent).
# Called by scripts/experiment/charts.js with datafile and outbase set.
set datafile separator comma
set datafile missing "NaN"
set grid
set key outside top center horizontal
set xlabel "Nodes in the update"
set ylabel "Gas used"
set format y "%.0f"
set offsets graph 0.02, graph 0.06, graph 0.06, 0
set xrange [0:*]
set yrange [0:*]
set title "setNodes gas by number of nodes written"
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 2:3 with points pt 7 ps 1.8 lc rgb "#2878B5" title "allowed", '' using 2:4 with points pt 5 ps 1.6 lc rgb "#C74E45" title "denied (reverted)"
