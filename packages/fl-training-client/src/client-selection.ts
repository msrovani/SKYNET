export interface ClientInfo {
  id: string;
  batteryLevel: number;
  isCharging: boolean;
  onWifi: boolean;
  thermalHeadroom: number;
  availableMemoryMb: number;
  lastActive: number;
  reliabilityScore: number;
}

export interface SelectionConfig {
  minBatteryLevel: number;
  requireCharging: boolean;
  requireWifi: boolean;
  minThermalHeadroom: number;
  minMemoryMb: number;
  maxClients: number;
}

export class ClientSelection {
  private config: Required<SelectionConfig>;

  constructor(config: Partial<SelectionConfig> = {}) {
    this.config = {
      minBatteryLevel: config.minBatteryLevel ?? 0.2,
      requireCharging: config.requireCharging ?? false,
      requireWifi: config.requireWifi ?? true,
      minThermalHeadroom: config.minThermalHeadroom ?? 4.0,
      minMemoryMb: config.minMemoryMb ?? 512,
      maxClients: config.maxClients ?? 50,
    };
  }

  select(clients: ClientInfo[]): ClientInfo[] {
    return clients
      .filter(c => this.meetsRequirements(c))
      .sort((a, b) => this.score(b) - this.score(a))
      .slice(0, this.config.maxClients);
  }

  private meetsRequirements(client: ClientInfo): boolean {
    if (client.batteryLevel < this.config.minBatteryLevel) return false;
    if (this.config.requireCharging && !client.isCharging) return false;
    if (this.config.requireWifi && !client.onWifi) return false;
    if (client.thermalHeadroom < this.config.minThermalHeadroom) return false;
    if (client.availableMemoryMb < this.config.minMemoryMb) return false;
    return true;
  }

  private score(client: ClientInfo): number {
    return (
      client.reliabilityScore * 0.4 +
      (client.isCharging ? 0.2 : client.batteryLevel * 0.2) +
      (client.thermalHeadroom / 15.0) * 0.2 +
      (client.availableMemoryMb / 4096.0) * 0.2
    );
  }
}
