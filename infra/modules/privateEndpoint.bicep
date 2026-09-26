@description('Azure region for private endpoints')
param location string

@description('Subnet ID for private endpoints')
param privateEndpointSubnetId string

@description('Function App resource ID')
param functionAppId string

@description('Storage Account resource ID')
param storageAccountId string

@description('Private DNS Zone ID for sites')
param sitesDnsZoneId string

@description('Private DNS Zone ID for storage blobs')
param blobDnsZoneId string

@description('Private DNS Zone ID for storage files')
param fileDnsZoneId string

@description('Private DNS Zone ID for storage queues')
param queueDnsZoneId string

@description('Private DNS Zone ID for storage tables')
param tableDnsZoneId string

resource functionPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-functionapp'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'plsc-functionapp'
        properties: {
          privateLinkServiceId: functionAppId
          groupIds: [
            'sites'
          ]
        }
      }
    ]
  }
}

resource functionDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = {
  parent: functionPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-azurewebsites-net'
        properties: {
          privateDnsZoneId: sitesDnsZoneId
        }
      }
    ]
  }
}

// 1. Storage Blob Endpoint
resource storageBlobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-storage-blob'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'plsc-storage-blob'
        properties: {
          privateLinkServiceId: storageAccountId
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource storageBlobDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = {
  parent: storageBlobPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-blob-core-windows-net'
        properties: {
          privateDnsZoneId: blobDnsZoneId
        }
      }
    ]
  }
}

// 2. Storage File Endpoint
resource storageFilePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-storage-file'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'plsc-storage-file'
        properties: {
          privateLinkServiceId: storageAccountId
          groupIds: [
            'file'
          ]
        }
      }
    ]
  }
}

resource storageFileDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = {
  parent: storageFilePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-file-core-windows-net'
        properties: {
          privateDnsZoneId: fileDnsZoneId
        }
      }
    ]
  }
}

// 3. Storage Queue Endpoint
resource storageQueuePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-storage-queue'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'plsc-storage-queue'
        properties: {
          privateLinkServiceId: storageAccountId
          groupIds: [
            'queue'
          ]
        }
      }
    ]
  }
}

resource storageQueueDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = {
  parent: storageQueuePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-queue-core-windows-net'
        properties: {
          privateDnsZoneId: queueDnsZoneId
        }
      }
    ]
  }
}

// 4. Storage Table Endpoint
resource storageTablePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-storage-table'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'plsc-storage-table'
        properties: {
          privateLinkServiceId: storageAccountId
          groupIds: [
            'table'
          ]
        }
      }
    ]
  }
}

resource storageTableDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-05-01' = {
  parent: storageTablePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-table-core-windows-net'
        properties: {
          privateDnsZoneId: tableDnsZoneId
        }
      }
    ]
  }
}

output functionPrivateEndpointId string = functionPrivateEndpoint.id
output storageBlobPrivateEndpointId string = storageBlobPrivateEndpoint.id
output storageFilePrivateEndpointId string = storageFilePrivateEndpoint.id
output storageQueuePrivateEndpointId string = storageQueuePrivateEndpoint.id
output storageTablePrivateEndpointId string = storageTablePrivateEndpoint.id
