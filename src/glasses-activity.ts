import { EventSourceType, OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk';

export function createGlassesActivity() {
  let state: 'active' | 'background' | 'exited' = 'active';

  return {
    isActive: () => state === 'active',
    lifecycle(type: OsEventTypeList | undefined) {
      switch (type) {
        case OsEventTypeList.FOREGROUND_ENTER_EVENT:
          state = 'active';
          return true;
        case OsEventTypeList.FOREGROUND_EXIT_EVENT:
          if (state !== 'exited') state = 'background';
          return true;
        case OsEventTypeList.ABNORMAL_EXIT_EVENT:
        case OsEventTypeList.SYSTEM_EXIT_EVENT:
          state = 'exited';
          return true;
        default:
          return false;
      }
    },
    acceptGesture(event: EvenHubEvent, fromCurrentCapture: boolean) {
      if (state === 'exited') return false;
      if (state === 'active') return true;
      const system = event.sysEvent;
      // The SDK sends hardware double taps without a capture container.
      const hardwareDoubleTap = !event.textEvent && !event.listEvent &&
        system?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT &&
        (system.eventSource === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R ||
          system.eventSource === EventSourceType.TOUCH_EVENT_FROM_RING ||
          system.eventSource === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L);
      if (!fromCurrentCapture && !hardwareDoubleTap) return false;
      state = 'active';
      return true;
    },
  };
}
