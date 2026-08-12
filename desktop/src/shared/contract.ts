export const DESKTOP_BRIDGE_VERSION = 1 as const;

export const IPC_CHANNELS = {
  getAppInfo: 'desktop:v1:app:get-info',
  openExternal: 'desktop:v1:shell:open-external',
} as const;

export interface DesktopAppInfo {
  readonly bridgeVersion: typeof DESKTOP_BRIDGE_VERSION;
  readonly name: string;
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly packaged: boolean;
}

export interface MarketingHubDesktopBridge {
  readonly version: typeof DESKTOP_BRIDGE_VERSION;
  getAppInfo(): Promise<DesktopAppInfo>;
  openExternal(url: string): Promise<boolean>;
}
