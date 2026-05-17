// Active learning script, use model from train-model to make predictions on the area
// Use the inspector to find where it struggles with predicting the correct class and add markers for model retraining
// Haven't finished a way for this to work fully yet but the export code is somewhat there


// Define configs
var modelAsset = 'projects/crop-mapping-titicaca/assets/Random_Forest_Model';
var targetYear = 2024;

// Draw the region on the map 
var roi = geometry;

// Define class labels
var cropLabel = 5; 
var nonCropLabel = 1; 
var classVis = {min: 1, max: 5, palette: ['green', 'brown', 'blue', 'grey', 'yellow']};

// Mask clouds and shadows
function maskHLS(img) {
  var fmask = img.select('Fmask');
  var clearMask = fmask.bitwiseAnd(30).eq(0);
  return img.updateMask(clearMask);
}

// Build predictors
function generatePredictors(year, area) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate   = ee.Date.fromYMD(year, 12, 31);

  var collection = ee.ImageCollection("NASA/HLS/HLSL30/v002")
    .filterDate(startDate, endDate)
    .filterBounds(area)
    .map(maskHLS)
    .map(function(img) {
      var optical = img.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
      var blue = optical.select('B2');
      var red  = optical.select('B4');
      var nir  = optical.select('B5');

      var ndvi = optical.normalizedDifference(['B5', 'B4']).rename('NDVI');
      var mndwi = optical.normalizedDifference(['B3', 'B6']).rename('MNDWI');

      var evi = nir.subtract(red).multiply(2.5).divide(
          nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)
        ).rename('EVI');

      var msavi = nir.multiply(2).add(1).subtract(
          nir.multiply(2).add(1).pow(2).subtract(
            nir.subtract(red).multiply(8)
          ).sqrt()
        ).divide(2).rename('MSAVI');

      return optical.addBands([ndvi, mndwi, evi, msavi]);
    });

  // Calculate temporal statistics
  var reducers = ee.Reducer.mean()
    .combine(ee.Reducer.median(), '', true)
    .combine(ee.Reducer.min(), '', true)
    .combine(ee.Reducer.max(), '', true)
    .combine(ee.Reducer.stdDev(), '', true)
    .combine(ee.Reducer.percentile([10, 25, 75, 90]), '', true);

  function extractStats(bandName, prefix) {
    var stats = collection.select(bandName).reduce(reducers);
    return stats.rename(stats.bandNames().map(function(name) {
      return ee.String(prefix).cat('_').cat(name);
    }));
  }

  var ndviStats  = extractStats('NDVI', 'ndvi');
  var mndwiStats = extractStats('MNDWI', 'mndwi');
  var eviStats   = extractStats('EVI', 'evi');
  var msaviStats = extractStats('MSAVI', 'msavi');

  var medianBands = collection.select(['B1','B2','B3','B4','B5','B6','B7']).median();

  var wetSeason = collection.filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 4, 30));
  var drySeason = collection.filterDate(ee.Date.fromYMD(year, 5, 1), ee.Date.fromYMD(year, 11, 30));

  var wetNdviMean = wetSeason.select('NDVI').mean().rename('wet_ndvi_mean');
  var dryNdviMean = drySeason.select('NDVI').mean().rename('dry_ndvi_mean');
  var seasonalDifference = wetNdviMean.subtract(dryNdviMean).rename('seasonal_difference');

  var ndviMax = ndviStats.select('ndvi_NDVI_max');
  var ndviMin = ndviStats.select('ndvi_NDVI_min');
  var ndviAmplitude = ndviMax.subtract(ndviMin).rename('ndvi_amplitude');
  var ndviIQR = ndviStats.select('ndvi_NDVI_p75').subtract(ndviStats.select('ndvi_NDVI_p25')).rename('ndvi_iqr');
  var ndviRatio = ndviMax.divide(ndviMin.abs().add(0.01)).rename('ndvi_ratio');

  var dem = ee.Image("USGS/SRTMGL1_003").clip(area);
  var elevation = dem.rename('elevation');
  var slope = ee.Terrain.slope(dem).rename('slope');
  var aspect = ee.Terrain.aspect(dem).rename('aspect');

  return ee.Image.cat([
    ndviStats, mndwiStats, eviStats, msaviStats, medianBands,
    wetNdviMean, dryNdviMean, seasonalDifference, ndviAmplitude, ndviIQR, ndviRatio,
    elevation, slope, aspect
  ]).clip(area);
}

// Load the model 
var loadedModel = ee.Classifier.load(modelAsset);

// Generate predictors
var predictors = generatePredictors(targetYear, roi);
var classificationMap = predictors.classify(loadedModel);

// Set up map interface
Map.centerObject(roi, 12);
Map.style().set('cursor', 'crosshair');

// Add background
Map.addLayer(predictors.select(['ndvi_NDVI_max', 'ndvi_amplitude', 'ndvi_NDVI_min']), {min:0, max:0.6}, 'False Colour Context', false);

// Add classification layer
Map.addLayer(classificationMap, classVis, 'Crop Classification');

// Create active learning inspector panel
var panel = ui.Panel({style: {width: '400px', position: 'bottom-right'}});
Map.add(panel);
panel.add(ui.Label('Active Learning Inspector', {fontWeight: 'bold', fontSize: '18px'}));
panel.add(ui.Label('1. Click map to check NDVI history.'));
panel.add(ui.Label('2. Use markers to label errors as correctCrop or correctNonCrop.'));

// Handle map clicks to display NDVI time series
Map.onClick(function(coords) {
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  panel.clear();
  panel.add(ui.Label("Analysing NDVI History...", {color: 'gray'}));
  
  var chart = ui.Chart.image.series(
    ee.ImageCollection("NASA/HLS/HLSL30/v002")
      .filterBounds(point)
      .filterDate(ee.Date.fromYMD(targetYear, 1, 1), ee.Date.fromYMD(targetYear, 12, 31))
      .map(maskHLS)
      .map(function(img) {
        var ndvi = img.normalizedDifference(['B5', 'B4']).rename('NDVI');
        return img.addBands(ndvi);
      }).select('NDVI'), 
    point, ee.Reducer.mean(), 30
  ).setOptions({
    title: 'NDVI Cycle: ' + targetYear, 
    vAxis: {viewWindow: {min: 0, max: 1}},
    hAxis: {format: 'MMM'}
  });
  
  panel.add(chart);
});

// Export corrections, I had a go at this buy couldn't find the best way to do it this is what I've got
// This script will need some changing if you plan to go through with the active learning
// Biggest problem was getting models from python to GEE, from what I tried I don't think it's doable for the active learning

if (typeof correctCrop !== 'undefined' || typeof correctNonCrop !== 'undefined') {
  var cropGroup = typeof correctCrop !== 'undefined' ? correctCrop.map(function(f){return f.set('class', cropLabel)}) : ee.FeatureCollection([]);
  var nonCropGroup = typeof correctNonCrop !== 'undefined' ? correctNonCrop.map(function(f){return f.set('class', nonCropLabel)}) : ee.FeatureCollection([]);
  
  var corrections = cropGroup.merge(nonCropGroup);
  
  var activeLearningSamples = predictors.sampleRegions({
    collection: corrections,
    properties: ['class'],
    scale: 30,
    geometries: true
  });
  
  Export.table.toAsset({
    collection: activeLearningSamples,
    description: 'ActiveLearning_Batch_1',
    assetId: 'ActiveLearning_Batch_1'
  });
  
  print('Ready to export ' + activeLearningSamples.size().getInfo() + ' correction points to Assets.');
}