/** Shared shape for every pluggable external provider. */
export type ProviderStatus = {
  /** The provider id as configured, e.g. "serper" or "none". */
  name: string;
  /** False when required credentials/settings are missing. */
  configured: boolean;
  /** Human-readable explanation shown verbatim in Settings. */
  detail: string;
};

export class ProviderNotConfiguredError extends Error {
  constructor(
    readonly providerKind: string,
    readonly providerName: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'ProviderNotConfiguredError';
  }
}

export const NOT_CONFIGURED_MESSAGE = 'Provider not configured.';
