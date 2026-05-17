// Train and export basic random forest model for active learning

// Define configs
var trainingDataAsset = 'projects/crop-mapping-titicaca/assets/Crop_Features';

// Load the training data
var trainingData = ee.FeatureCollection(trainingDataAsset);

// Define input features exactly matching the columns in your dataset
var bands = [
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
  'ndvi_NDVI_max', 'ndvi_NDVI_mean', 'ndvi_NDVI_median', 'ndvi_NDVI_min',
  'ndvi_NDVI_p10', 'ndvi_NDVI_p25', 'ndvi_NDVI_p75', 'ndvi_NDVI_p90', 'ndvi_NDVI_stdDev',
  'mndwi_MNDWI_max', 'mndwi_MNDWI_mean', 'mndwi_MNDWI_median', 'mndwi_MNDWI_min',
  'mndwi_MNDWI_p10', 'mndwi_MNDWI_p25', 'mndwi_MNDWI_p75', 'mndwi_MNDWI_p90', 'mndwi_MNDWI_stdDev',
  'evi_EVI_max', 'evi_EVI_mean', 'evi_EVI_median', 'evi_EVI_min',
  'evi_EVI_p10', 'evi_EVI_p25', 'evi_EVI_p75', 'evi_EVI_p90', 'evi_EVI_stdDev',
  'msavi_MSAVI_max', 'msavi_MSAVI_mean', 'msavi_MSAVI_median', 'msavi_MSAVI_min',
  'msavi_MSAVI_p10', 'msavi_MSAVI_p25', 'msavi_MSAVI_p75', 'msavi_MSAVI_p90', 'msavi_MSAVI_stdDev',
  'wet_ndvi_mean', 'dry_ndvi_mean', 'seasonal_difference',
  'ndvi_amplitude', 'ndvi_iqr', 'ndvi_ratio',
  'elevation', 'slope', 'aspect'
];

// Initialise and train the Random Forest classifier
var rfClassifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 250,
  variablesPerSplit: null, 
  minLeafPopulation: 1,
  bagFraction: 0.8,
  seed: 42
}).train({
  features: trainingData,
  classProperty: 'class',
  inputProperties: bands
});
// Calculate and print training accuracy for verification
var trainAccuracy = rfClassifier.confusionMatrix();
print('Training Overall Accuracy: ', trainAccuracy.accuracy());
print('Training Confusion Matrix: ', trainAccuracy);

// Export classifier to assets for use in the active learning script
Export.classifier.toAsset({
  classifier: rfClassifier,
  description: 'Export_Trained_RF_Model',
  assetId: "projects/crop-mapping-titicaca/assets/Trained_Random_Forest_Model"
});