// __mocks__/mediaSourceMock.js

class MockTimeRanges {
  constructor (ranges) {
    this.ranges = ranges; // Array of [start, end] pairs
  }

  get length () {
    return this.ranges.length;
  }

  start (index) {
    if (index >= this.length) {
      throw new DOMException('Index out of bounds');
    }
    return this.ranges[index][0];
  }

  end (index) {
    if (index >= this.length) {
      throw new DOMException('Index out of bounds');
    }
    return this.ranges[index][1];
  }
}

class MockSourceBuffer {
  constructor (mimeType) {
    this.mimeType = mimeType;
    this.updating = false;
    this.buffered = new MockTimeRanges([
      [
        0,
        0.034,
      ], // First range: 0 to 0.034 seconds ( what we saw with bosch)
      [
        10,
        15,
      ], // Second range: 10 to 15 seconds (gap between 5-10 seconds)
    ]);
    this.appendBuffer = jest.fn();
    this.remove = jest.fn();
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
    this.dispatchEvent = jest.fn();
  }
}

const MediaSource = jest.fn(() => ({
  readyState: 'open',
  duration: 5,
  // Mock the addSourceBuffer method to return an instance of your mocked SourceBuffer
  addSourceBuffer: jest.fn(() => new MockSourceBuffer()),
  endOfStream: jest.fn(),
  // Mock any other methods or properties of MediaSource if necessary
  isTypeSupported: jest.fn(() => true),
  isReady: jest.fn(() => true),
  addEventListener: jest.fn((event, listener) => {}),
}));

module.exports = MediaSource;
