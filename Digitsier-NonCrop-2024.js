// 2024 Training Data Digitiser
// Prepares median composite and interactive inspector
// Exports drawn geometries as training polygons

var TARGET_MONTH = 8;
var TARGET_YEAR = 2024;
var CLOUD_THRESHOLD = 60; // Can be removed with cloud filter
var EXPORT_POLYGONS = false; // Set true to export polygons to asset then delete old ones to stop memory errors.

// Apply scaling factors
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  return image.addBands(opticalBands, null, true);
}

// Mask clouds and cloud shadows
function maskClouds(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0)
               .and(qa.bitwiseAnd(1 << 4).eq(0))
               .and(qa.bitwiseAnd(1 << 1).eq(0));
  return image.updateMask(mask);
}

// Generate median composite for target month
var startDate = ee.Date.fromYMD(TARGET_YEAR, TARGET_MONTH, 1);
var endDate   = startDate.advance(1, 'month');

var dataset = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUD_COVER', CLOUD_THRESHOLD))
    .map(maskClouds)
    .map(applyScaleFactors);

var composite = dataset.median();

// Create full year collection with NDVI and MSAVI bands
var chartCol = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterDate(ee.Date.fromYMD(TARGET_YEAR, 1, 1), ee.Date.fromYMD(TARGET_YEAR, 12, 31))
    .map(maskClouds)
    .map(applyScaleFactors)
    .map(function(img) {
      var ndvi = img.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
      var nir = img.select('SR_B5');
      var red = img.select('SR_B4');
      var msavi = nir.expression(
        '(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2', 
        {'NIR': nir, 'RED': red}
      ).rename('MSAVI');
      return img.addBands([ndvi, msavi]);
    });

// Map target month composite
var visParams = {
  bands: ['SR_B5', 'SR_B4', 'SR_B3'], 
  min: 0.0,
  max: 0.4,
  gamma: 1.2
};

Map.layers().reset();
Map.addLayer(composite, visParams, 'Inspection Layer - Month ' + TARGET_MONTH);

// Create interactive inspector panel
var panel = ui.Panel({style: {width: '400px', position: 'bottom-right'}});
Map.add(panel);
Map.style().set('cursor', 'crosshair');

panel.add(ui.Label('Pixel Signature Inspector', {fontWeight: 'bold', fontSize: '18px'}));
panel.add(ui.Label('Click the map to see the growth profile for ' + TARGET_YEAR));

Map.onClick(function(coords) {
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  panel.clear();
  panel.add(ui.Label("Analysing Pixel...", {color: 'gray'}));
  
  var chart = ui.Chart.image.series({
    imageCollection: chartCol.select(['NDVI', 'MSAVI']),
    region: point,
    reducer: ee.Reducer.mean(),
    scale: 30
  }).setOptions({
    title: 'Growth Cycle (NDVI & MSAVI)',
    vAxis: {title: 'Index Value', viewWindow: {min: -0.1, max: 1}},
    hAxis: {format: 'MMM'},
    series: {
      0: {color: 'green', labelInLegend: 'NDVI'},
      1: {color: 'blue', labelInLegend: 'MSAVI'}
    }
  });
  
  panel.add(chart);
});

// Format and export geometry collections to asset
if (EXPORT_POLYGONS){
  
var processLayer = function(geometry, label) {
  var polyList = geometry.geometries();
  
  return ee.FeatureCollection(polyList.map(function(g) {
    return ee.Feature(ee.Geometry(g)).set('class', label);
  }));
};

var veg = processLayer(NaturalVegetation_2024, 'natural');
var rock = processLayer(Rocky_2024, 'rocky');
var water = processLayer(Water_2024, 'water');
var res = processLayer(Residential_2024, 'residential');

var collection2024_Final = ee.FeatureCollection([veg, rock, water, res]).flatten();

Export.table.toAsset({
  collection: collection2024_Final,
  description: 'Training_Polygons_2024',
  assetId: 'Training_Polygons_2024'
});

print('Run in Tasks.');
}