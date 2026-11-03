/** Public links and build facts shown in the masthead and footer. */
export const REPO_URL = 'https://github.com/byjoellobo/openbijli';

export const LINKS = {
  source: REPO_URL,
  releases: `${REPO_URL}/releases`,
  docs: `${REPO_URL}/tree/main/docs`,
  wrongNumber: `${REPO_URL}/issues/new?template=data-error.yml`,
  newOrder: `${REPO_URL}/issues/new?template=tariff-order.yml`,
  hardware: `${REPO_URL}/tree/main/hardware/meter-sakshi`,
  codeLicence: `${REPO_URL}/blob/main/LICENSE`,
  dataLicence: `${REPO_URL}/blob/main/data/LICENSE.md`,
  hardwareLicence: `${REPO_URL}/blob/main/hardware/LICENSE.md`,
} as const;

/** Injected by vite.config.ts from apps/web/package.json. */
export const APP_VERSION: string = __APP_VERSION__;
