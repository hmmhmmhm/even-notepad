const PERSONAL_BUILD_URL = 'https://github.com/hmmhmmhm/quiet-terminal';

type PublicDialogElements = {
  computerList: HTMLElement;
  addComputer: HTMLButtonElement;
  computerForm: HTMLElement;
  setupGuide: HTMLButtonElement;
  status: HTMLElement;
};

export function configurePublicTerminalDialog(elements: PublicDialogElements, document: Document) {
  elements.computerList.hidden = true;
  elements.addComputer.hidden = true;
  elements.computerForm.hidden = true;
  elements.setupGuide.hidden = true;

  elements.status.replaceChildren(document.createTextNode('Terminal is not supported in the public build. See the '));
  const guideLink = document.createElement('a');
  guideLink.href = PERSONAL_BUILD_URL;
  guideLink.target = '_blank';
  guideLink.rel = 'noopener noreferrer';
  guideLink.textContent = 'personal build guide';
  elements.status.append(guideLink, document.createTextNode('.'));
}
