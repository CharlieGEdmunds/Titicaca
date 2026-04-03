// Polygon Extractor (NonCrop)

// Load assets and assign polygon IDs
var training2023 = ee.FeatureCollection("projects/crop-mapping-titicaca/assets/Training_Polygons_2023")
  .map(function(f){ return f.set('poly_id', f.id()); });

var training2024 = ee.FeatureCollection("projects/crop-mapping-titicaca/assets/Training_Polygons_2024")
  .map(function(f){ return f.set('poly_id', f.id()); });
  
var training2025 = ee.FeatureCollection("projects/crop-mapping-titicaca/assets/Training_Polygons_2025")
  .map(function(f){ return f.set('poly_id', f.id()); });

// Generate spectral predictors and terrain metrics
var getPredictors = function(year) {
  // Filter and scale images
  var collection = ee.ImageCollection("NASA/HLS/HLSL30/v002")
    .filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year, 12, 31))
    .map(function(img) {
      var optical = img.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']).multiply(0.0001);
      var ndvi = optical.normalizedDifference(['B5', 'B4']).rename('NDVI');
      var mndwi = optical.normalizedDifference(['B3', 'B6']).rename('MNDWI');
      var nir = optical.select('B5');
      var red = optical.select('B4');
      var msavi = nir.multiply(2).add(1).subtract(
        nir.multiply(2).add(1).pow(2).subtract(
          nir.subtract(red).multiply(8)
        ).sqrt()
      ).divide(2).rename('MSAVI');
      return img.addBands([ndvi, mndwi, msavi]).addBands(optical);
    });

  // Calculate statistics
  var maxIndices = collection.select(['NDVI', 'MSAVI', 'MNDWI']).max().rename(['maxNdvi', 'maxMsavi', 'maxMndwi']);
  var baseIndices = collection.select(['NDVI', 'MSAVI']).min().rename(['baseNdvi', 'baseMsavi']);
  var ampNdvi = maxIndices.select('maxNdvi').subtract(baseIndices.select('baseNdvi')).rename('ampNdvi');
  
  var medianBands = collection.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']).median();
  var slope = ee.Terrain.slope(ee.Image("USGS/SRTMGL1_003")).rename('slope');
  var coords = ee.Image.pixelLonLat();
  
  // Combine all bands
  return ee.Image.cat([maxIndices, baseIndices, ampNdvi, medianBands, slope, coords]);
};

var columns = [
  'class', 'poly_id', 'year_id', 'maxNdvi', 'maxMsavi', 'maxMndwi', 
  'baseNdvi', 'baseMsavi', 'ampNdvi', 
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'slope', 'longitude', 'latitude'
];

// Extract noncrop features for 2023
var nonCrop2023 = getPredictors(2023).sampleRegions({
  collection: training2023,
  properties: ['class', 'poly_id'], 
  scale: 30,
  tileScale: 16, 
  geometries: true
}).map(function(f){ return f.set('year_id', 2023)}).select(columns).filter(ee.Filter.notNull(['.geo']));

// Extracts non-crop features for 2024
var nonCrop2024 = getPredictors(2024).sampleRegions({
  collection: training2024,
  properties: ['class', 'poly_id'],
  scale: 30,
  tileScale: 16,
  geometries: true
}).map(function(f){ return f.set('year_id', 2024)}).select(columns).filter(ee.Filter.notNull(['.geo']));

// Extracts non-crop features for 2025
var nonCrop2025 = getPredictors(2025).sampleRegions({
  collection: training2025,
  properties: ['class', 'poly_id'],
  scale: 30,
  tileScale: 16,
  geometries: true
}).map(function(f){ return f.set('year_id', 2025)}).select(columns).filter(ee.Filter.notNull(['.geo']));

// Exports individual datasets to Google Drive
Export.table.toDrive({ collection: nonCrop2023, description: 'HLS_Polygons_2023', fileFormat: 'CSV' });
Export.table.toDrive({ collection: nonCrop2024, description: 'HLS_Polygons_2024', fileFormat: 'CSV' });
Export.table.toDrive({ collection: nonCrop2025, description: 'HLS_Polygons_2025', fileFormat: 'CSV' });