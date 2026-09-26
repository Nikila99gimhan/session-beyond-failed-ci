@description('Deployment target environment name')
@allowed([
  'development'
  'staging'
  'production'
])
param targetEnvironment string = 'production'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param appNameSuffix string = uniqueString(resourceGroup().id)

@description('The SKU of the App Service Plan (Elastic Premium)')
@allowed([
  'EP1'
  'EP2'
  'EP3'
])
param appServicePlanSku string = 'EP1'

@description('Enable or disable public network access to the Function App and Storage')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Disabled'

@description('Enforce authentication on the Function App')
param enableAuthentication bool = true

@description('Provision enterprise private networking (VNet, subnets, private endpoints, private DNS)')
param enablePrivateNetworking bool = true

@description('Enable zone redundancy on the App Service Plan')
param zoneRedundant bool = true

var storageAccountName = 'stfunc${take(appNameSuffix, 14)}'
var hostingPlanName = 'asp-${targetEnvironment}-${take(appNameSuffix, 8)}'
var functionAppName = 'func-${targetEnvironment}-${take(appNameSuffix, 8)}'
var vnetName = 'vnet-${targetEnvironment}-${take(appNameSuffix, 8)}'

module network './modules/network.bicep' = if (enablePrivateNetworking) {
  name: 'networkDeployment'
  params: {
    location: location
    vnetName: vnetName
  }
}

module storage './modules/storage.bicep' = {
  name: 'storageDeployment'
  params: {
    location: location
    storageAccountName: storageAccountName
    publicNetworkAccess: publicNetworkAccess
  }
}

module hostingPlan './modules/hostingPlan.bicep' = {
  name: 'hostingPlanDeployment'
  params: {
    location: location
    hostingPlanName: hostingPlanName
    skuName: appServicePlanSku
    zoneRedundant: zoneRedundant
  }
}

module functionApp './modules/functionApp.bicep' = {
  name: 'functionAppDeployment'
  params: {
    location: location
    functionAppName: functionAppName
    hostingPlanId: hostingPlan.outputs.id
    storageAccountName: storageAccountName
    publicNetworkAccess: publicNetworkAccess
    enableAuthentication: enableAuthentication
    outboundSubnetId: enablePrivateNetworking ? network!.outputs.outboundSubnetId : ''
  }
  dependsOn: [
    storage
  ]
}

module privateEndpoints './modules/privateEndpoint.bicep' = if (enablePrivateNetworking) {
  name: 'privateEndpointsDeployment'
  params: {
    location: location
    privateEndpointSubnetId: enablePrivateNetworking ? network!.outputs.privateEndpointSubnetId : ''
    functionAppId: functionApp.outputs.id
    storageAccountId: storage.outputs.id
    sitesDnsZoneId: enablePrivateNetworking ? network!.outputs.sitesDnsZoneId : ''
    blobDnsZoneId: enablePrivateNetworking ? network!.outputs.blobDnsZoneId : ''
    fileDnsZoneId: enablePrivateNetworking ? network!.outputs.fileDnsZoneId : ''
    queueDnsZoneId: enablePrivateNetworking ? network!.outputs.queueDnsZoneId : ''
    tableDnsZoneId: enablePrivateNetworking ? network!.outputs.tableDnsZoneId : ''
  }
}

output functionAppId string = functionApp.outputs.id
output functionAppName string = functionApp.outputs.name
output hostingPlanSku string = hostingPlan.outputs.sku
output publicNetworkAccess string = functionApp.outputs.publicNetworkAccess
output isPrivateNetworkingEnabled bool = enablePrivateNetworking
