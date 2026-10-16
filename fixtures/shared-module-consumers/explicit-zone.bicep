// Registered sample consumer A: explicitly keeps zone redundancy enabled.
module sampleHostingPlan '../module/hostingPlan.bicep' = {
  name: 'sampleHostingPlan'
  params: {
    location: 'westeurope'
    hostingPlanName: 'sample-explicit-plan'
    skuName: 'EP1'
    zoneRedundant: true
  }
}
