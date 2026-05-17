/*
 Script for extracting spectral metrics and terrain variables for ML 
 */

// Load sample locations (Replace with your training data)
var pointLocations = ee.FeatureCollection("projects/crop-mapping-titicaca/assets/Christian-Samples");

// Configure temporal parameters
var YEAR = 2024;
var START_DATE = ee.Date.fromYMD(YEAR, 1, 1);
var END_DATE   = ee.Date.fromYMD(YEAR, 12, 31);

// Define wet and dry seasons
var WET_START = ee.Date.fromYMD(YEAR, 1, 1);
var WET_END   = ee.Date.fromYMD(YEAR, 4, 30);
var DRY_START = ee.Date.fromYMD(YEAR, 5, 1);
var DRY_END   = ee.Date.fromYMD(YEAR, 11, 30);

// Build AOI buffer around samples to limit processing area
var AOI = pointLocations.geometry().buffer(5000);

// Mask clouds and shadows
function maskHLS(img) {
  var fmask = img.select('Fmask');
  
  var clearMask = fmask.bitwiseAnd(30).eq(0);
  
  return img.updateMask(clearMask);
}

// Build optical collection and calculate vegetation indices
function buildCollection() {
  return ee.ImageCollection("NASA/HLS/HLSL30/v002")
    .filterDate(START_DATE, END_DATE)
    .filterBounds(AOI)
    .map(maskHLS)
    .map(function(img) {
      var optical = img.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);

      var blue = optical.select('B2');
      var red  = optical.select('B4');
      var nir  = optical.select('B5');
      var swir = optical.select('B6');

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

      return optical.addBands([ndvi, mndwi, evi, msavi])
        .copyProperties(img, img.propertyNames());
    });
}

var collection = buildCollection();

// Calculate temporal statistics using combined reducers
function temporalStats(collection, bandName, prefix) {
  var band = collection.select(bandName);

  var reducers = ee.Reducer.mean()
    .combine(ee.Reducer.median(), '', true)
    .combine(ee.Reducer.min(), '', true)
    .combine(ee.Reducer.max(), '', true)
    .combine(ee.Reducer.stdDev(), '', true)
    .combine(ee.Reducer.percentile([10, 25, 75, 90]), '', true);

  var stats = band.reduce(reducers);

  var renamed = stats.rename(
    stats.bandNames().map(function(name) {
      return ee.String(prefix).cat('_').cat(name);
    })
  );

  return renamed;
}

// Extract temporal features
var ndviStats  = temporalStats(collection, 'NDVI',  'ndvi');
var mndwiStats = temporalStats(collection, 'MNDWI', 'mndwi');
var eviStats   = temporalStats(collection, 'EVI',   'evi');
var msaviStats = temporalStats(collection, 'MSAVI', 'msavi');

// Extract median for raw spectral features
var medianBands = collection.select(['B1','B2','B3','B4','B5','B6','B7']).median();

// Calculate seasonal mean NDVI differences
var wetSeason = collection.filterDate(WET_START, WET_END);
var drySeason = collection.filterDate(DRY_START, DRY_END);

var wetNdviMean = wetSeason.select('NDVI').mean().rename('wet_ndvi_mean');
var dryNdviMean = drySeason.select('NDVI').mean().rename('dry_ndvi_mean');
var seasonalDifference = wetNdviMean.subtract(dryNdviMean).rename('seasonal_difference');

// Calculate NDVI dynamics
var ndviMax = ndviStats.select('ndvi_NDVI_max');
var ndviMin = ndviStats.select('ndvi_NDVI_min');
var ndviP75 = ndviStats.select('ndvi_NDVI_p75');
var ndviP25 = ndviStats.select('ndvi_NDVI_p25');

var ndviAmplitude = ndviMax.subtract(ndviMin).rename('ndvi_amplitude');
var ndviIQR = ndviP75.subtract(ndviP25).rename('ndvi_iqr');
var ndviRatio = ndviMax.divide(ndviMin.abs().add(0.01)).rename('ndvi_ratio');

// Extract terrain features
var dem = ee.Image("USGS/SRTMGL1_003").clip(AOI);
var elevation = dem.rename('elevation');
var slope = ee.Terrain.slope(dem).rename('slope');
var aspect = ee.Terrain.aspect(dem).rename('aspect');

// Extract coordinates
var coords = ee.Image.pixelLonLat();

// Combine all predictors into final stack
var predictorImage = ee.Image.cat([
  ndviStats, mndwiStats, eviStats, msaviStats,
  medianBands,
  wetNdviMean, dryNdviMean, seasonalDifference,
  ndviAmplitude, ndviIQR, ndviRatio,
  elevation, slope, aspect,
  coords
]);

// Sample features at point locations
var extractedFeatures = predictorImage.sampleRegions({
  collection: pointLocations,
  properties: ['class', 'class_name'],
  scale: 30,
  geometries: true,
  tileScale: 16
}).map(function(f) {
  return f.set('year_id', YEAR);
}).filter(ee.Filter.notNull(['ndvi_NDVI_mean']));

// Print sanity checks
print('Collection size:', collection.size());
print('Example image:', collection.first());
print('Extracted features:', extractedFeatures.limit(5));

// Export data to Google Drive
Export.table.toDrive({
  collection: extractedFeatures,
  description: 'Advanced_Crop_Features_Optimised_' + YEAR,
  fileFormat: 'CSV'
});