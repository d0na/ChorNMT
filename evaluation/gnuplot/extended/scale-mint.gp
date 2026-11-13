# Gas of the model contract and of a mint by the tasks of a synthetic model. Data: tasks,modelGas,mintGas.
# Called by scripts/experiment/extended-charts.js with datafile and outbase set.
set datafile separator comma
set grid
set key outside top center horizontal
set xlabel "Tasks in the model"
set ylabel "Gas used"
set format y "%.0f"
set xrange [0:*]
set yrange [0:*]
set title "Deploying and minting a model by its size"
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 1:3 with linespoints pt 7 ps 1.6 lw 2 lc rgb "#2878B5" title "mint of an instance", '' using 1:2 with linespoints pt 5 ps 1.4 lw 2 lc rgb "#E0A030" title "deploy of the model contract"
