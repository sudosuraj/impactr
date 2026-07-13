declare global {
  const IMPACTR_VERSION: string
  const IMPACTR_CHANNEL: string
}

export const InstallationVersion = typeof IMPACTR_VERSION === "string" ? IMPACTR_VERSION : "local"
export const InstallationChannel = typeof IMPACTR_CHANNEL === "string" ? IMPACTR_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
