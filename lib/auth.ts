export interface AuthConfig {
  enabled: boolean;
  provider: "placeholder";
  roles: string[];
}

export const authConfig: AuthConfig = {
  enabled: false,
  provider: "placeholder",
  roles: ["admin", "editor", "viewer"]
};

export function getAuthStatus() {
  return {
    enabled: authConfig.enabled,
    provider: authConfig.provider,
    message: "Auth scaffold is present but not enforced."
  };
}
