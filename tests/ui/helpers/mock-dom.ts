export interface MockNode {
  readonly nodeType: number;
  parentElement: MockElement | null;
  textContent: string;
}

export class MockTextNode implements MockNode {
  public readonly nodeType = 3;
  public parentElement: MockElement | null = null;
  constructor(public textContent: string) {}
}

export class MockElement implements MockNode {
  public readonly nodeType = 1;
  public parentElement: MockElement | null = null;
  public children: MockElement[] = [];
  public childNodes: (MockElement | MockTextNode)[] = [];
  public attributes: Record<string, string> = {};
  public style: { cssText: string; display?: string } = { cssText: '' };
  public listeners: Record<string, ((event: unknown) => void)[]> = {};
  public type?: string;
  public disabled = false;

  constructor(public readonly tagName: string) {}

  public get nextSibling(): MockNode | null {
    if (!this.parentElement) {
      return null;
    }
    const idx = this.parentElement.childNodes.indexOf(this);
    if (idx >= 0 && idx < this.parentElement.childNodes.length - 1) {
      return this.parentElement.childNodes[idx + 1] as unknown as MockNode;
    }
    return null;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  public getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  public appendChild<T extends MockNode>(child: T): T {
    const node = child as unknown as MockElement | MockTextNode;
    node.parentElement = this;
    this.childNodes.push(node);
    if (node.nodeType === 1) {
      this.children.push(node as MockElement);
    }
    return child;
  }

  public insertBefore<T extends MockNode>(newChild: T, refChild: MockNode | null): T {
    const node = newChild as unknown as MockElement | MockTextNode;
    node.parentElement = this;
    if (!refChild) {
      return this.appendChild(newChild);
    }
    const idx = this.childNodes.indexOf(refChild as unknown as MockElement | MockTextNode);
    if (idx === -1) {
      return this.appendChild(newChild);
    }
    this.childNodes.splice(idx, 0, node);
    if (node.nodeType === 1) {
      const childIdx = this.children.indexOf(refChild as unknown as MockElement);
      if (childIdx === -1) {
        this.children.push(node as MockElement);
      } else {
        this.children.splice(childIdx, 0, node as MockElement);
      }
    }
    return newChild;
  }

  public removeChild<T extends MockNode>(child: T): T {
    const node = child as unknown as MockElement | MockTextNode;
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
    }
    if (node.nodeType === 1) {
      const childIdx = this.children.indexOf(node as MockElement);
      if (childIdx !== -1) {
        this.children.splice(childIdx, 1);
      }
    }
    node.parentElement = null;
    return child;
  }

  public addEventListener(event: string, handler: (e: unknown) => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  public removeEventListener(event: string, handler: (e: unknown) => void): void {
    if (!this.listeners[event]) {
      return;
    }
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  public dispatchEvent(event: { type: string; [key: string]: unknown }): boolean {
    const handlers = this.listeners[event.type] ?? [];
    for (const h of handlers) {
      h(event);
    }
    return true;
  }

  public get textContent(): string {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  public setContent(text: string): void {
    this.childNodes = [new MockTextNode(text)];
    this.children = [];
  }

  public set textContent(text: string) {
    this.setContent(text);
  }

  public querySelector(selector: string): MockElement | null {
    for (const child of this.children) {
      if (
        selector === child.tagName.toLowerCase() ||
        (selector.startsWith('[') && selector.endsWith(']') && this.matchesAttr(child, selector))
      ) {
        return child;
      }
      const found = child.querySelector(selector);
      if (found) {
        return found;
      }
    }
    return null;
  }

  public querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    for (const child of this.children) {
      if (
        selector === child.tagName.toLowerCase() ||
        (selector.startsWith('[') && selector.endsWith(']') && this.matchesAttr(child, selector))
      ) {
        results.push(child);
      }
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  private matchesAttr(elem: MockElement, attrSelector: string): boolean {
    const inner = attrSelector.slice(1, -1);
    if (inner.includes('=')) {
      const parts = inner.split('=');
      const key = parts[0] ?? '';
      const rawVal = parts[1] ?? '';
      const cleanVal = rawVal.replace(/['"]/g, '');
      return elem.getAttribute(key) === cleanVal;
    }
    return elem.getAttribute(inner) !== null;
  }
}

export function createMockDocument(): Document {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};

  const doc = {
    createElement(tagName: string) {
      return new MockElement(tagName);
    },
    createTextNode(text: string) {
      return new MockTextNode(text);
    },
    addEventListener(event: string, handler: (e: unknown) => void) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(handler);
    },
    removeEventListener(event: string, handler: (e: unknown) => void) {
      if (!listeners[event]) {
        return;
      }
      listeners[event] = listeners[event].filter((h) => h !== handler);
    },
    dispatchEvent(event: { type: string; [key: string]: unknown }) {
      const handlers = listeners[event.type] ?? [];
      for (const h of handlers) {
        h(event);
      }
      return true;
    },
  };

  return doc as unknown as Document;
}
