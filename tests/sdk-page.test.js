import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RebuildPageContainer, CreateStartUpPageContainer } from '@evenrealities/even_hub_sdk';
import { pageContainer } from '../src/sdk-page.ts';

test('SDK page model preserves the existing layout payload and omitted fields', () => {
  const layouts = [
    { containerTotalNum: 1, textObject: [{ containerID: 1, content: ' ', textColor: 0, isEventCapture: 0 }] },
    { containerTotalNum: 2, textObject: [{ containerID: 2, content: 'test' }], imageObject: [{ containerID: 3, width: 32, height: 28 }] },
    { containerTotalNum: 1, listObject: [{ containerID: 20, isEventCapture: 1, itemContainer: { itemCount: 2, itemWidth: 520, isItemSelectBorderEn: 1, itemName: ['First', 'Second'] } }] },
    { containerTotalNum: 0, textObject: [], imageObject: [], listObject: [] },
  ];
  for (const layout of layouts) {
    const expected = RebuildPageContainer.toJson(layout);
    assert.deepEqual(pageContainer(layout).toJson(), expected);
    assert.deepEqual(new CreateStartUpPageContainer(pageContainer(layout)).toJson(), CreateStartUpPageContainer.toJson(layout));
  }
});

test('SDK text and image updates preserve zero brightness and image bytes', async () => {
  const { TextContainerUpgrade, ImageRawDataUpdate } = await import('@evenrealities/even_hub_sdk');
  const text = { containerID: 1, content: '', textColor: 0 };
  const image = { containerID: 2, containerName: 'tile', imageData: new Uint8Array([0, 128, 255]) };
  assert.deepEqual(new TextContainerUpgrade(text).toJson(), TextContainerUpgrade.toJson(text));
  assert.deepEqual(new ImageRawDataUpdate(image).toJson(), ImageRawDataUpdate.toJson(image));
});
