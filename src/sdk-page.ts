import { RebuildPageContainer, TextContainerProperty, ImageContainerProperty, ListContainerProperty, ListItemContainerProperty } from '@evenrealities/even_hub_sdk';

type PlainList = Omit<Partial<ListContainerProperty>, 'itemContainer'> & { itemContainer?: Partial<ListItemContainerProperty> };
type PlainPage = { containerTotalNum: number; textObject?: Partial<TextContainerProperty>[]; imageObject?: Partial<ImageContainerProperty>[]; listObject?: PlainList[] };
export function pageContainer(value: PlainPage): RebuildPageContainer {
  const page = new RebuildPageContainer({ containerTotalNum: value.containerTotalNum });
  if (value.textObject) page.textObject = value.textObject.map(item => new TextContainerProperty(item));
  if (value.imageObject) page.imageObject = value.imageObject.map(item => new ImageContainerProperty(item));
  if (value.listObject) page.listObject = value.listObject.map(item => new ListContainerProperty({ ...item, itemContainer: item.itemContainer ? new ListItemContainerProperty(item.itemContainer) : undefined }));
  return page;
}
