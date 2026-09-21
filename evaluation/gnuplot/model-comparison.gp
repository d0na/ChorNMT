set terminal pngcairo size 1400,850 font "Arial,12"
set output "evaluation/figures/model-comparison.png"
set datafile separator comma
set style data histograms
set style histogram clustered
set style fill solid
set grid ytics
set title "Model structure before and after the delta"
plot "evaluation/experiment-results.generated.csv" every ::3::3 using 5:xtic(1) title "Nodes", '' every ::3::3 using 6 title "Edges", '' every ::3::3 using 7 title "Gateways", '' every ::3::3 using 8 title "Messages", "evaluation/experiment-results.generated.csv" every ::5::5 using 5:xtic(1) notitle, '' every ::5::5 using 6 notitle, '' every ::5::5 using 7 notitle, '' every ::5::5 using 8 notitle
