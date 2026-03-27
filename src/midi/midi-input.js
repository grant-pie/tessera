import { emit } from '../utils/event-bus.js';
import { getInput } from './midi-access.js';

let currentPort = null;

export function attachInputListeners(port) {
  if (currentPort) {
    currentPort.onmidimessage = null;
  }

  currentPort = port;

  if (!port) return;

  port.onmidimessage = (e) => {
    const [status, data1, data2] = e.data;

    // Pass MIDI clock and transport bytes to external-clock handler
    // (handled by clock.js / external-clock.js via the port reference)

    // Forward all messages for potential external handlers
    emit('midi:message', { status, data1, data2, port });
  };
}

export function refreshInputPort() {
  const port = getInput();
  if (port !== currentPort) {
    attachInputListeners(port);
  }
}
