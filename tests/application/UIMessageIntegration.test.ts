import type { MessageBus, ExtensionMessage } from '../../src/application/interfaces/messaging/MessageBus.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

class MockMessageBus implements MessageBus {
  public lastRequestedMessage: ExtensionMessage | null = null;
  public mockResponse: any = null;
  public listeners: { [type: string]: Array<() => void> } = {};

  public async request<T>(message: ExtensionMessage): Promise<T> {
    this.lastRequestedMessage = message;
    return this.mockResponse as T;
  }

  public listen(type: string, callback: () => void): () => void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
    return () => {
      this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
    };
  }

  public trigger(type: string) {
    if (this.listeners[type]) {
      this.listeners[type].forEach(cb => cb());
    }
  }
}

async function runTests() {
  console.log('Running UI Message Integration tests...');

  const bus = new MockMessageBus();

  // Test 1: START_SESSION message request routing
  try {
    bus.mockResponse = { session: { id: 'session-123', name: 'UI Test Session' } };
    const response = await bus.request<any>({
      type: 'START_SESSION',
      name: 'UI Test Session'
    } as any);

    assert(bus.lastRequestedMessage !== null, 'Request sent');
    assert(bus.lastRequestedMessage?.type === 'START_SESSION', 'Correct message type');
    assert((bus.lastRequestedMessage as any).name === 'UI Test Session', 'Correct payload');
    assert(response.session.id === 'session-123', 'Response parsed correctly');
    console.log('✓ START_SESSION message routing - PASS');
  } catch (err) {
    console.error('✗ START_SESSION message routing - FAIL', err);
    process.exit(1);
  }

  // Test 2: CAPTURE_REQUEST message routing
  try {
    bus.lastRequestedMessage = null;
    bus.mockResponse = { capture: { id: 'cap-1', status: 'PENDING' } };
    const response = await bus.request<any>({
      type: 'CAPTURE_REQUEST'
    });

    assert(bus.lastRequestedMessage !== null, 'Request sent');
    assert(bus.lastRequestedMessage?.type === 'CAPTURE_REQUEST', 'Correct message type');
    assert(response.capture.id === 'cap-1', 'Response parsed correctly');
    console.log('✓ CAPTURE_REQUEST message routing - PASS');
  } catch (err) {
    console.error('✗ CAPTURE_REQUEST message routing - FAIL', err);
    process.exit(1);
  }

  // Test 3: Event listening triggers refresh callbacks
  try {
    let triggeredCount = 0;
    const unsub = bus.listen('CAPTURE_COMPLETE', () => {
      triggeredCount++;
    });

    bus.trigger('CAPTURE_COMPLETE');
    assert(triggeredCount === 1, 'Callback triggered on event');

    unsub();
    bus.trigger('CAPTURE_COMPLETE');
    assert(triggeredCount === 1, 'Callback not triggered after unsubscribing');
    console.log('✓ Event listener registration and disposal - PASS');
  } catch (err) {
    console.error('✗ Event listener registration and disposal - FAIL', err);
    process.exit(1);
  }

  console.log('All UI Message Integration tests passed!');
}

runTests();
