# Gas of the tokenURI read by the tasks of the model. Data: tasks,origin,tokenUriGas,tokenUriBytes.
# Called by scripts/experiment/extended-charts.js with datafile and outbase set.
set datafile separator comma
set grid
set key outside top center horizontal
set xlabel "Tasks in the model"
set ylabel "Gas of the tokenURI call (a read, not paid)"
set y2label "Bytes returned"
set format y "%.0f"
set format y2 "%.0f"
set ytics nomirror
set y2tics
set xrange [0:*]
set yrange [0:*]
set y2range [0:*]
set title "Reading the whole model by its size"
set terminal svg size 1400,850 font "Arial,12"
set output outbase.".svg"
plot datafile using 1:3 with linespoints pt 7 ps 1.6 lw 2 lc rgb "#2878B5" title "gas of tokenURI", '' using 1:4 axes x1y2 with linespoints pt 5 ps 1.4 lw 2 lc rgb "#5A9E6F" title "bytes returned"
