# Model structure read from the chain before and after the delta. Data: model,nodes,edges,gateways,messages.
# Called by scripts/experiment/charts.js with datafile and outbase set.
set datafile separator comma
set style data histograms
set style histogram clustered
set style fill solid border -1
set grid ytics
set key outside top center horizontal
set ylabel "Count"
set yrange [0:*]
set title "Model structure: baseline (F4) and after the delta (F5)"
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 2:xtic(1) title "Nodes" lc rgb "#2878B5", '' using 3 title "Sequence edges" lc rgb "#F6C85F", '' using 4 title "Gateways" lc rgb "#6F4E7C", '' using 5 title "Messages" lc rgb "#9DD866"
