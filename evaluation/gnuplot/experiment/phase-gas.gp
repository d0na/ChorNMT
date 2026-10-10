# Gas by experiment phase, allowed and denied transactions stacked. Data: phase,allowedGas,deniedGas.
# Called by scripts/experiment/charts.js with datafile and outbase set.
set datafile separator comma
set style data histograms
set style histogram rowstacked
set style fill solid border -1
set boxwidth 0.7
set grid ytics
set key outside top center horizontal
set ylabel "Gas used"
set format y "%.0f"
set title "Gas by experiment phase"
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 2:xtic(1) title "allowed" lc rgb "#2878B5", '' using 3 title "denied (reverted)" lc rgb "#C74E45"
