@description('Azure region for App Service Plan')
param location string

@description('Name of the App Service Plan')
param hostingPlanName string

@description('App Service Plan SKU')
@allowed([
  'EP1'
  'EP2'
  'EP3'
])
param skuName string = 'EP1'

@description('Enable zone redundancy for high availability')
param zoneRedundant bool = true

resource hostingPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: hostingPlanName
  location: location
  sku: {
    name: skuName
    tier: 'ElasticPremium'
  }
  properties: {
    reserved: true
    zoneRedundant: zoneRedundant
  }
}

output id string = hostingPlan.id
output name string = hostingPlan.name
output sku string = hostingPlan.sku.name
