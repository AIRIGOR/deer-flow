import {afterEach, describe, expect, it, vi} from 'vitest';
import {renderApprovals, approvalBlockReason} from './founder-approvals.js';
class Element {
  tag: string; textContent = ''; children: Element[] = []; dataset: Record<string,string> = {}; style = {}; disabled = false;
  listeners: Record<string, () => Promise<void>> = {};
  constructor(tag: string) {this.tag = tag;}
  append(...children: Element[]) {this.children.push(...children);}
  replaceChildren() {this.children = [];}
  setAttribute() {}
  addEventListener(event: string, handler: () => Promise<void>) {this.listeners[event] = handler;}
}
afterEach(() => vi.unstubAllGlobals());
describe('Founder approval availability', () => {
  it('blocks incomplete exact emails and generic placeholders with actionable explanations', () => {
    expect(approvalBlockReason({payload: {}})).toContain('concrete action payload');
    expect(approvalBlockReason({action_type:'EMAIL_SEND',payload:{to:'invalid'}})).toContain('exact sender');
    expect(approvalBlockReason({action_type:'EMAIL_SEND',payload:{from:'owner@example.com',to:'pitch@example.com',subject:'Intro',body:'Hello'}})).toContain('public recipient source');
    expect(approvalBlockReason({action_type:'INTERNAL_TEST',payload:{objective:'Review saved evidence'}})).toBe('');
  });
  it('keeps request-changes usable while an incomplete approval stays disabled after a failed decision', async () => {
    vi.stubGlobal('document',{createElement:(tag:string)=>new Element(tag)});
    const parent = new Element('section');
    const decide = vi.fn().mockRejectedValue(new Error('Connection interrupted'));
    renderApprovals(parent as unknown as HTMLElement,[{action_key:'test',title:'Incomplete internal proposal',status:'NEEDS_APPROVAL',action_type:'INTERNAL_TEST',payload:{}}],decide);
    const card = parent.children[0];
    const buttons = card.children.filter(el=>el.tag==='button');
    expect(buttons.find(el=>el.dataset.decision==='APPROVE')?.disabled).toBe(true);
    expect(buttons.find(el=>el.dataset.decision==='REQUEST_CHANGES')?.disabled).toBe(false);
    expect(card.children.some(el=>el.textContent.includes('concrete action payload'))).toBe(true);
    await buttons.find(el=>el.dataset.decision==='REQUEST_CHANGES')!.listeners.click();
    expect(decide).toHaveBeenCalledTimes(1);
    expect(buttons.find(el=>el.dataset.decision==='APPROVE')?.disabled).toBe(true);
    expect(buttons.find(el=>el.dataset.decision==='REQUEST_CHANGES')?.disabled).toBe(false);
  });
});
