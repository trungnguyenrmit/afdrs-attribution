// Public configuration only. Never add a password, access token or client secret.
window.AFDRS_CONFIG = {
  clientId: '',
  tenantId: '',
  driveId: '',
  folderId: '',
  sourcePath: 'source/observations.csv',
  assignmentsPath: 'assignments/assignments.csv',
  outputsPath: 'outputs',
  scopes: ['Files.ReadWrite.All'],
  gfcLabels: { '1': 'GFC 1', '2': 'GFC 2', '3': 'GFC 3' },
  // Populate labels with the agreed field protocol before expert review.
  imageryUrl: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  imageryAttribution: 'Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, Aerogrid, IGN, IGP, and the GIS User Community'
};
