// Just copy and paste this into the bottom of a script to add the graph

// Configs
var INSPECTOR_YEAR = 2024;

// Apply scaling factors
var applyScaleFactors = function(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  return image.addBands(opticalBands, null, true);
};

// Mask clouds
var maskClouds = function(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0)
               .and(qa.bitwiseAnd(1 << 4).eq(0))
               .and(qa.bitwiseAnd(1 << 1).eq(0));
  return image.updateMask(mask);
};

// Build image collection for chart (Can change if using a different collection)
var chartCollection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterDate(ee.Date.fromYMD(INSPECTOR_YEAR, 1, 1), ee.Date.fromYMD(INSPECTOR_YEAR, 12, 31))
  .map(maskClouds)
  .map(applyScaleFactors)
  .map(function(img) {
    var ndvi = img.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    var nir = img.select('SR_B5');
    var red = img.select('SR_B4');
    var blue = img.select('SR_B2');
    
    var msavi = nir.expression(
      '(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2', 
      {'NIR': nir, 'RED': red}
    ).rename('MSAVI');
    
    var evi = nir.subtract(red).multiply(2.5).divide(
        nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)
      ).rename('EVI');
      
    return img.addBands([ndvi, msavi, evi]);
  });

// Create inspector panel
var inspectorPanel = ui.Panel({style: {width: '400px', position: 'bottom-right'}});
Map.add(inspectorPanel);
Map.style().set('cursor', 'crosshair');

inspectorPanel.add(ui.Label('Pixel Inspector', {fontWeight: 'bold', fontSize: '18px'}));
inspectorPanel.add(ui.Label('Click the pixel you want to inspect...'));

// Generate and display chart on map click
Map.onClick(function(coords) {
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  
  inspectorPanel.clear();
  inspectorPanel.add(ui.Label('Pixel Result (Click the name to highlight the line):', {color: 'gray'}));
  
  var chart = ui.Chart.image.series({
    imageCollection: chartCollection.select(['NDVI', 'MSAVI', 'EVI']),
    region: point,
    reducer: ee.Reducer.mean(),
    scale: 30
  }).setOptions({
    title: 'Growth Cycle (' + INSPECTOR_YEAR + ')',
    vAxis: {title: 'Index Value', viewWindow: {min: -0.1, max: 1}},
    hAxis: {format: 'MMM'},
    series: {
      0: {color: 'green', labelInLegend: 'NDVI'},
      1: {color: 'blue', labelInLegend: 'MSAVI'},
      2: {color: 'purple', labelInLegend: 'EVI'}
    }
  });
  
  inspectorPanel.add(chart);
});