import { ChromeMessageBus } from '../../../src/infrastructure/messaging/ChromeMessageBus.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Global mock of Chrome Runtime API
const listeners: Array<(message: any, sender: any, sendResponse: (response: any) => void) => boolean | void> = [];
let lastSentMessage: any = null;
let shouldRuntimeFail = false;

(globalThis as any).chrome = {
  runtime: {
    sendMessage: async (message: any) => {
      lastSentMessage = message;
      if (shouldRuntimeFail) {
        throw new Error('Chrome runtime disconnected');
      }

      // Find listeners and trigger them
      for (const listener of listeners) {
        let responded = false;
        let responseData: any = null;
        const sendResponse = (response: any) => {
          responded = true;
          responseData = response;
        };

        const isAsync = listener(message, { id: 'test-sender' }, sendResponse);
        if (isAsync) {
          // Simulate async wait
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
          return responseData;
        } else if (responded) {
          return responseData;
        }
      }
      return undefined;
    },
    onMessage: {
      addListener: (listener: any) => {
        listeners.push(listener);
      },
      removeListener: (listener: any) => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }
  }
};

async function runTests() {
  console.log('Running ChromeMessageBus Unit Tests...');
  const messageBus = new ChromeMessageBus();

  // Test 1: Listener registration & send
  let receivedMessage: any = null;
  const unsubscribe = messageBus.listen('test-event', (payload) => {
    receivedMessage = payload;
    return { success: true };
  });

  messageBus.send({ type: 'test-event', payload: { data: 'hello' } });
  // Wait for the send message loop
  await new Promise<void>((resolve) => setTimeout(resolve, 10));

  assert(receivedMessage !== null, 'Listener should have received the message');
  assert(receivedMessage.data === 'hello', 'Payload data should be "hello"');
  console.log('✓ Test 1: Send and Listener registration works - PASS');

  // Test 2: Request/Response Correlation
  const response = await messageBus.request<{ success: boolean }>({
    type: 'test-event',
    payload: { query: 'test' }
  });

  assert(response.success === true, 'Response should contain success: true');
  console.log('✓ Test 2: Request/response correlation works - PASS');

  // Test 3: Offscreen Ping contract
  // Register offscreen listener simulating offscreen.ts
  const offscreenUnsubscribe = messageBus.listen('offscreen', (message) => {
    if (message.target === 'offscreen' && message.action === 'ping') {
      return { success: true, status: 'ready' };
    }
    return { success: false };
  });

  const pingResult = await messageBus.request<{ success: boolean; status: string }>({
    target: 'offscreen',
    action: 'ping'
  });

  assert(pingResult.success === true, 'Ping response success should be true');
  assert(pingResult.status === 'ready', 'Ping response status should be ready');
  console.log('✓ Test 3: Offscreen ping contract verified - PASS');

  // Clean up listeners
  unsubscribe();
  offscreenUnsubscribe();

  // Test 4: Unsubscribe cleanup works
  receivedMessage = null;
  messageBus.send({ type: 'test-event', payload: { data: 'hello again' } });
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert(receivedMessage === null, 'Unsubscribed listener should not receive messages');
  console.log('✓ Test 4: Unregistering listeners works - PASS');

  // Test 5: Error propagation
  shouldRuntimeFail = true;
  try {
    await messageBus.request({ type: 'error-trigger' });
    console.error('✗ Test 5: Error propagation - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: any) {
    assert(err instanceof Error, 'Error should be instance of Error');
    assert(err.message.includes('Chrome message request failed'), 'Error message should be wrapped cleanly');
    console.log('✓ Test 5: Error propagation and mapping works - PASS');
  } finally {
    shouldRuntimeFail = false;
  }

  console.log('All ChromeMessageBus unit tests passed successfully!');
}

runTests();
