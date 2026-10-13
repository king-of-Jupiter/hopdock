declare const __HOPDOCK_VERSION__: string;
declare const __HOPDOCK_COMMIT__: string;

// Embedded at build time: packaged apps don't need Git installed.
export const buildVersion = __HOPDOCK_VERSION__;
export const buildCommit = __HOPDOCK_COMMIT__;
