import {
  AllowedEnvironment,
  AllowedResourceType,
  AllowedService,
  DeploymentPolicy,
  ApprovedSkusInfo,
  ServiceOwnership,
  ChangeWindow,
} from "./types.js";

export interface IPolicyRepository {
  getDeploymentPolicies(
    environment: AllowedEnvironment,
    resourceType: AllowedResourceType
  ): Promise<DeploymentPolicy[] | null>;

  getApprovedSkus(
    environment: AllowedEnvironment
  ): Promise<ApprovedSkusInfo | null>;

  getServiceOwnership(
    service: AllowedService
  ): Promise<ServiceOwnership | null>;

  getChangeWindow(
    service: AllowedService
  ): Promise<ChangeWindow | null>;
}

export class FixturePolicyRepository implements IPolicyRepository {
  private simulateUnavailable = false;
  private simulateDelayMs = 0;

  constructor(options?: { simulateUnavailable?: boolean; simulateDelayMs?: number }) {
    if (options?.simulateUnavailable) {
      this.simulateUnavailable = true;
    }
    if (options?.simulateDelayMs) {
      this.simulateDelayMs = options.simulateDelayMs;
    }
  }

  private async applySimulation(): Promise<void> {
    if (this.simulateDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateDelayMs));
    }
    if (this.simulateUnavailable) {
      throw new Error("Underlying policy repository storage connection failed");
    }
  }

  async getDeploymentPolicies(
    environment: AllowedEnvironment,
    resourceType: AllowedResourceType
  ): Promise<DeploymentPolicy[] | null> {
    await this.applySimulation();

    if (environment === "production") {
      if (resourceType === "Microsoft.Web/sites") {
        return [
          {
            policyId: "POL-AZ-NET-001",
            name: "Prohibit Public Ingress on Production Functions",
            environment: "production",
            resourceType: "Microsoft.Web/sites",
            rule: "publicNetworkAccess must be explicitly set to 'Disabled'. Ingress must be restricted to private endpoints or secured virtual networks.",
            description: "Production Functions must not expose unrestricted public access",
            severity: "High",
            humanSecurityReviewRequired: true,
            complianceStandard: "NIST-SP-800-53 / CIS-Azure-9.1",
          },
          {
            policyId: "POL-AZ-AUTH-004",
            name: "Require Application Authentication on Production Functions",
            environment: "production",
            resourceType: "Microsoft.Web/sites",
            rule: "enableAuthentication must be true for the sample organization's production Function workload.",
            description: "Production Function application authentication must be enabled",
            severity: "High",
            humanSecurityReviewRequired: true,
            complianceStandard: "Sample-Org-Access-Control-2026",
          },
          {
            policyId: "POL-AZ-PRIV-005",
            name: "Require Private Networking on Production Functions",
            environment: "production",
            resourceType: "Microsoft.Web/sites",
            rule: "enablePrivateNetworking must be true for the sample organization's production Function workload.",
            description: "Production Function private networking path must be provisioned",
            severity: "High",
            humanSecurityReviewRequired: true,
            complianceStandard: "Sample-Org-Network-Control-2026",
          },
        ];
      }

      if (resourceType === "Microsoft.Storage/storageAccounts") {
        return [
          {
            policyId: "POL-AZ-STG-002",
            name: "Prohibit Public Blob Access and Ingress on Storage",
            environment: "production",
            resourceType: "Microsoft.Storage/storageAccounts",
            rule: "allowBlobPublicAccess must be false and publicNetworkAccess must be 'Disabled'.",
            description: "Production storage accounts must disallow public access",
            severity: "High",
            humanSecurityReviewRequired: true,
            complianceStandard: "CIS-Azure-3.1",
          },
        ];
      }

      if (resourceType === "Microsoft.Web/serverfarms") {
        return [
          {
            policyId: "POL-AZ-SKU-003",
            name: "Approved Hosting Plan Tier Limit",
            environment: "production",
            resourceType: "Microsoft.Web/serverfarms",
            rule: "Demo proposal: production plans may use EP1 or EP2. EP3 requires FinOps sign-off.",
            description: "Workload SKU must match approved capacity tier",
            severity: "Medium",
            humanSecurityReviewRequired: false,
            complianceStandard: "FinOps-Gov-2026",
          },
        ];
      }
    } else {
      // Staging / Development
      return [
        {
          policyId: "POL-NONPROD-001",
          name: "Non-production Network Access Guidelines",
          environment: environment,
          resourceType: resourceType,
          rule: "Public access may be enabled with strict source IP allowlisting.",
          description: "Non-production environments require IP filtering for any public endpoint.",
          severity: "Medium",
          humanSecurityReviewRequired: false,
          complianceStandard: "Internal-Baseline-v1",
        },
      ];
    }

    return null;
  }

  async getApprovedSkus(
    environment: AllowedEnvironment
  ): Promise<ApprovedSkusInfo | null> {
    await this.applySimulation();

    if (environment === "production") {
      return {
        environment: "production",
        approvedSkus: ["EP1", "EP2"],
        restrictedSkus: ["EP3"],
        maxTier: "ElasticPremium-2 (EP2)",
        costPolicyRule: "Demo proposal: production functions may use EP1 or EP2. EP3 requires FinOps exemption.",
        estimatedCostPerMonth: {
          "EP1": "~$145 / month (1 core, 3.5 GB RAM)",
          "EP2": "~$290 / month (2 cores, 7 GB RAM)",
          "EP3": "~$580 / month (4 cores, 14 GB RAM) - High Cost Tier",
        },
        finOpsApprovalRequired: true,
      };
    }

    if (environment === "staging" || environment === "development") {
      return {
        environment: environment,
        approvedSkus: ["EP1"],
        restrictedSkus: ["EP2", "EP3"],
        maxTier: "ElasticPremium-1 (EP1)",
        costPolicyRule: "Non-production environments must use standard baseline tier.",
        estimatedCostPerMonth: {
          "EP1": "~$145 / month",
        },
        finOpsApprovalRequired: false,
      };
    }

    return null;
  }

  async getServiceOwnership(
    service: AllowedService
  ): Promise<ServiceOwnership | null> {
    await this.applySimulation();

    if (service === "azure-functions-service" || service === "cloud-core-service") {
      return {
        service: service,
        ownerTeam: "Cloud Platform Engineering",
        serviceTier: "Tier-1 Mission Critical",
        technicalLead: "tech-lead@company.internal",
        securityLiaison: "secops-liaison@company.internal",
        finOpsLead: "finops@company.internal",
        slackChannel: "#cloud-platform-security",
      };
    }

    return null;
  }

  async getChangeWindow(
    service: AllowedService
  ): Promise<ChangeWindow | null> {
    await this.applySimulation();

    if (service === "azure-functions-service" || service === "cloud-core-service") {
      return {
        service: service,
        status: "OPEN",
        activeWindow: "Monday - Thursday 09:00 - 15:00 UTC",
        nextChangeWindow: "Standard business hours UTC",
        freezeWindowActive: false,
        requiresCabApproval: false,
      };
    }

    return null;
  }
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

export interface CacheOptions {
  ttlMs?: number;
  tenantId?: string;
}

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  policyVersion: string;
}

/**
 * Enterprise Cached Policy Repository with bounded TTL, freshness checks,
 * and tenant-isolation boundaries.
 */
export class CachedPolicyRepository implements IPolicyRepository {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0 };
  private ttlMs: number;
  private tenantId: string;
  private underlying: IPolicyRepository;

  constructor(underlying: IPolicyRepository = new FixturePolicyRepository(), options?: CacheOptions) {
    this.underlying = underlying;
    this.ttlMs = options?.ttlMs ?? 300_000; // 5 min default
    this.tenantId = options?.tenantId ?? "default-tenant";
  }

  public getStats(): CacheStats {
    return { ...this.stats };
  }

  public clear(): void {
    this.cache.clear();
  }

  private buildKey(tool: string, paramKey: string): string {
    return `${this.tenantId}::${tool}::${paramKey}`;
  }

  private getCached<T>(key: string, requiredVersion: string = "2026.3"): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    if (entry.policyVersion !== requiredVersion) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data as T;
  }

  private setCached<T>(key: string, data: T, policyVersion: string = "2026.3"): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      cachedAt: now,
      expiresAt: now + this.ttlMs,
      policyVersion,
    });
  }

  async getDeploymentPolicies(
    environment: AllowedEnvironment,
    resourceType: AllowedResourceType
  ): Promise<DeploymentPolicy[] | null> {
    const key = this.buildKey("deployment-policies", `${environment}::${resourceType}`);
    const cached = this.getCached<DeploymentPolicy[]>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await this.underlying.getDeploymentPolicies(environment, resourceType);
    if (fresh !== null) {
      this.setCached(key, fresh);
    }
    return fresh;
  }

  async getApprovedSkus(
    environment: AllowedEnvironment
  ): Promise<ApprovedSkusInfo | null> {
    const key = this.buildKey("approved-skus", environment);
    const cached = this.getCached<ApprovedSkusInfo>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await this.underlying.getApprovedSkus(environment);
    if (fresh !== null) {
      this.setCached(key, fresh);
    }
    return fresh;
  }

  async getServiceOwnership(
    service: AllowedService
  ): Promise<ServiceOwnership | null> {
    const key = this.buildKey("service-ownership", service);
    const cached = this.getCached<ServiceOwnership>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await this.underlying.getServiceOwnership(service);
    if (fresh !== null) {
      this.setCached(key, fresh);
    }
    return fresh;
  }

  async getChangeWindow(
    service: AllowedService
  ): Promise<ChangeWindow | null> {
    const key = this.buildKey("change-window", service);
    const cached = this.getCached<ChangeWindow>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await this.underlying.getChangeWindow(service);
    if (fresh !== null) {
      this.setCached(key, fresh);
    }
    return fresh;
  }
}
