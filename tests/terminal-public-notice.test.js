import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurePublicTerminalDialog } from '../src/terminal-public-notice.ts';

test('public Terminal dialog hides connection controls and exposes a clickable personal build guide', () => {
  const elements = {
    computerList: { hidden: false },
    addComputer: { hidden: false },
    computerForm: { hidden: false },
    setupGuide: { hidden: false },
    status: { children: [], replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); } },
  };
  const document = {
    createTextNode: text => ({ textContent: text }),
    createElement: tag => ({ tag, textContent: '', href: '', target: '', rel: '' }),
  };

  configurePublicTerminalDialog(elements, document);

  assert.equal(elements.computerList.hidden, true);
  assert.equal(elements.addComputer.hidden, true);
  assert.equal(elements.computerForm.hidden, true);
  assert.equal(elements.setupGuide.hidden, true);
  assert.equal(elements.status.children[0].textContent, 'Terminal is not supported in the public build. See the ');
  const link = elements.status.children[1];
  assert.equal(link.tag, 'a');
  assert.equal(link.href, 'https://github.com/hmmhmmhm/quiet-terminal');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.textContent, 'personal build guide');
  assert.equal(elements.status.children[2].textContent, '.');
});
