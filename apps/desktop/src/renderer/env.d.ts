import type { HopdockApi } from '@hopdock/ui/preload-api';

declare global {
  interface Window {
    hopdock: HopdockApi;
  }
}

export {};
