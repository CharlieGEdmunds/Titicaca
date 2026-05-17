# Titicaca

All the javascript files should be run in GEE and the python files locally.

Run Digitisers -> Extracts -> Preprocess -> Main

The models should be resuable with any data you end up using, I would look at the most important features and focus on those as some (like EVI) are not very helpful and just waste time exporting.

The active learning is unfortunately a bit unfinished, I gave it a go but the problems with getting models into python and trying to find the best way to get the learning pipeline set up just took too long and I ran out of time before I could go into much detail on it, 
once I realised it was probably not going to work I just focussed on making sure all the other scripts were as useful as possible in the future especially the data extraction, model training and ndvi graph.
