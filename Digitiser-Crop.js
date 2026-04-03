// Positive Crop Extraction Script
// Extracts crop pixels based on thresholds
// Includes coordinates for python spatial autocorrelation

var SETTINGS = {
  years: [2023, 2024, 2025],
  roi: geometry,
  pointsPerYear: 3000,
  minAmplitude: 0.45,
  maxBaseNdvi: 0.25,
  maxMndwi: 0,
  maxSlope: 20, // RENAME RENAME RENAME
  classLabel: 1
};

// Generate spectral predictors and terrain metrics
var getPredictors = function(year, region) {
  var collection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(region)
    .filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 12, 31))
    .map(function(img) {
      var optical = img.select('SR_B.').multiply(0.0000275).add(-0.2);
      var ndvi = optical.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
      var mndwi = optical.normalizedDifference(['SR_B3', 'SR_B6']).rename('MNDWI');
      return img.addBands([ndvi, mndwi]);
    });

  var ndviCol = collection.select('NDVI');
  var maxNdvi = ndviCol.max().rename('maxNdvi');
  var baseNdvi = ndviCol.min().rename('baseNdvi');
  var ampNdvi = maxNdvi.subtract(baseNdvi).rename('ampNdvi');
  
  var mndwi = collection.select('MNDWI').median().rename('mndwi');
  var slope = ee.Terrain.slope(ee.Image("USGS/SRTMGL1_003")).rename('slope');
  
  // Add coordinates
  var coords = ee.Image.pixelLonLat();
  
  return ee.Image.cat([maxNdvi, baseNdvi, ampNdvi, mndwi, slope, coords]).clip(region);
};

// Extract crop pixels 
var getCropPoints = function(year) {
  var predictors = getPredictors(year, SETTINGS.roi);
  
  var cropMask = predictors.select('ampNdvi').gte(SETTINGS.minAmplitude)
    .and(predictors.select('baseNdvi').lte(SETTINGS.maxBaseNdvi))
    .and(predictors.select('slope').lte(SETTINGS.maxSlope))
    .and(predictors.select('mndwi').lte(SETTINGS.maxMndwi));
    
  var cropImage = predictors.updateMask(cropMask);
  
  return cropImage.sample({
    region: SETTINGS.roi,
    scale: 30,
    numPixels: SETTINGS.pointsPerYear,
    geometries: true,
    tileScale: 4
  }).map(function(f) { 
    return f.set({
      'class': SETTINGS.classLabel,
      'year': year 
    });
  });
};

var multiYearPoints = ee.FeatureCollection(SETTINGS.years.map(getCropPoints)).flatten();

Export.table.toAsset({
  collection: multiYearPoints,
  description: 'Crop_Points_Main',
  assetId: 'Crop_Points_Main'
});