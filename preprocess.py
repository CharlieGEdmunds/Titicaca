# Does spatial autocorrelation and prepares dataset for model

import pandas as pd
import glob

# Load polygon data
poly_files = glob.glob('HLS_Polygons_*.csv')
df_poly = pd.concat([pd.read_csv(f) for f in poly_files], ignore_index=True).dropna()

# Load point data
point_files = glob.glob('HLS_Points_*.csv')
df_points = pd.concat([pd.read_csv(f) for f in point_files], ignore_index=True).dropna()

print(f"Original crop points loaded: {len(df_points)}")

# Create ~111m spatial grid
df_points['grid_lat'] = df_points['latitude'].round(3)
df_points['grid_lon'] = df_points['longitude'].round(3)

# Drops points in same square
df_points_thinned = df_points.drop_duplicates(subset=['grid_lat', 'grid_lon']).reset_index(drop=True)
df_points_thinned = df_points_thinned.drop(columns=['grid_lat', 'grid_lon'])
df_points_thinned['poly_id'] = 'crop_' + df_points_thinned.index.astype(str)

print(f"Crop points after thinning: {len(df_points_thinned)}")

# Merge polygons and points
df_master = pd.concat([df_poly, df_points_thinned], ignore_index=True)

# Limits maximum pixels per polygon to prevent spatial autocorrelation
MAX_PIXELS = 15
df_balanced = df_master.sample(frac=1, random_state=42).groupby('poly_id').head(MAX_PIXELS).reset_index(drop=True)

print(f"Final model-ready dataset size: {len(df_balanced)} pixels")

# Exports final dataset
df_balanced.to_csv('Model_Ready_Features.csv', index=False)