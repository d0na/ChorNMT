set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/model-comparison.png"
set datafile separator comma
set style data histograms
set style histogram clustered
set style fill solid
set grid ytics
set key outside top center horizontal
set ylabel "Count"
set title "Model structure: baseline versus after parallel delta"
plot "evaluation/model-structure.generated.csv" using 2:xtic(1) title "Nodes" lc rgb "#2878B5", '' using 3 title "Sequence edges" lc rgb "#F6C85F", '' using 4 title "Parallel gateways" lc rgb "#6F4E7C", '' using 5 title "Messages" lc rgb "#9DD866"
