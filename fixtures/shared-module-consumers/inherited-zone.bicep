// Registered sample consumer B: relies on the shared module's default.
module sampleHostingPlan '../module/hostingPlan.bicep' = {
  name: 'sampleHostingPlan'
  params: {
    location: 'westeurope'
    hostingPlanName: 'sample-inherited-plan'
    skuName: 'EP1'
  }
}
