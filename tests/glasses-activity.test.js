import test from 'node:test';
import assert from 'node:assert/strict';
import { evenHubEventFromJson, OsEventTypeList } from '@evenrealities/even_hub_sdk';
import { createGlassesActivity } from '../src/glasses-activity.ts';

const system = (Event_Type, EventSource) => evenHubEventFromJson({ type: 'sysEvent', jsonData: { Event_Type, EventSource } });

test('the first glasses or ring double tap after foreground exit works without scrolling', () => {
  for (const source of ['TOUCH_EVENT_FROM_GLASSES_R', 'TOUCH_EVENT_FROM_GLASSES_L', 'TOUCH_EVENT_FROM_RING']) {
    const activity = createGlassesActivity();
    activity.lifecycle(OsEventTypeList.FOREGROUND_EXIT_EVENT);
    assert.equal(activity.isActive(), false);
    assert.equal(activity.acceptGesture(system('DOUBLE_CLICK', source), false), true, source);
    assert.equal(activity.isActive(), true);
  }
});

test('stale capture events and unspecified hardware sources do not resume a suspended page', () => {
  const activity = createGlassesActivity();
  activity.lifecycle(OsEventTypeList.FOREGROUND_EXIT_EVENT);
  const staleCapture = evenHubEventFromJson({ type: 'textEvent', jsonData: { Container_Name: 'old-capture', Event_Type: 'DOUBLE_CLICK' } });
  assert.equal(activity.acceptGesture(staleCapture, false), false);
  assert.equal(activity.acceptGesture(system('DOUBLE_CLICK'), false), false);
  assert.equal(activity.acceptGesture(system('DOUBLE_CLICK', 'TOUCH_EVENT_FORM_DUMMY_NULL'), false), false);
  assert.equal(activity.acceptGesture(system('CLICK', 'TOUCH_EVENT_FROM_RING'), false), false);
  const scroll = evenHubEventFromJson({ type: 'textEvent', jsonData: { Container_Name: 'terminal-frame', Event_Type: 'SCROLL_TOP' } });
  assert.equal(activity.acceptGesture(scroll, true), true);
});

test('system and abnormal exit require a foreground-enter before delayed input is accepted', () => {
  for (const exit of [OsEventTypeList.SYSTEM_EXIT_EVENT, OsEventTypeList.ABNORMAL_EXIT_EVENT]) {
    const activity = createGlassesActivity();
    activity.lifecycle(exit);
    activity.lifecycle(OsEventTypeList.FOREGROUND_EXIT_EVENT);
    assert.equal(activity.acceptGesture(system('DOUBLE_CLICK', 'TOUCH_EVENT_FROM_RING'), false), false);
    assert.equal(activity.acceptGesture(system('DOUBLE_CLICK', 'TOUCH_EVENT_FROM_RING'), true), false);
    activity.lifecycle(OsEventTypeList.FOREGROUND_ENTER_EVENT);
    assert.equal(activity.acceptGesture(system('DOUBLE_CLICK'), false), true);
  }
});
