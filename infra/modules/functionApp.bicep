@description('Azure region for Function App')
param location string

@description('Function App resource name')
param functionAppName string

@description('Hosting Plan Resource ID')
param hostingPlanId string

@description('Storage Account Resource Name')
param storageAccountName string

@description('Enable or disable public network access')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Disabled'

@description('Enforce Microsoft Entra or EasyAuth authentication')
param enableAuthentication bool = true

@description('Outbound subnet ID for VNet integration')
param outboundSubnetId string = ''

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: hostingPlanId
    httpsOnly: true
    clientCertMode: 'Required'
    publicNetworkAccess: publicNetworkAccess
    virtualNetworkSubnetId: !empty(outboundSubnetId) ? outboundSubnetId : null
    vnetRouteAllEnabled: !empty(outboundSubnetId)
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      healthCheckPath: '/api/hello'
      minimumElasticInstanceCount: 1
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storageAccount.name
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
      ]
    }
  }
}

// Storage Blob Data Owner: b7e6dc6d-f1e8-4753-8033-07882414ecb2
resource blobDataOwnerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, functionApp.id, 'StorageBlobDataOwner')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-07882414ecb2')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Queue Data Contributor: 974cf4bf-4058-45ff-8404-9720b666a4f4
resource queueDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, functionApp.id, 'StorageQueueDataContributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974cf4bf-4058-45ff-8404-9720b666a4f4')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Table Data Contributor: 0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3
resource tableDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, functionApp.id, 'StorageTableDataContributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource authSettings 'Microsoft.Web/sites/config@2023-01-01' = if (enableAuthentication) {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
    }
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
  }
}

output id string = functionApp.id
output name string = functionApp.name
output defaultHostName string = functionApp.properties.defaultHostName
output publicNetworkAccess string = functionApp.properties.publicNetworkAccess
