import MediaSource from 'MediaSource'; // Import the mocked MediaSource
import SourceBuffer from '../SourceBuffer';
import MediaSourceWrapper from '../MediaSourceWrapper';

const _ = require('lodash');

let instance;

beforeEach(() => {
  global.window.MediaSource = MediaSource;
  instance = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
  jest.spyOn(instance.logger, 'debug');
  jest.spyOn(instance.logger, 'info');
  jest.spyOn(instance.sourceBuffer, 'remove');
});

describe('SourceBuffer.gapInBufferedRanges()', () => {
  it('should detect a gap between time ranges', () => {
    // Check that there is indeed a gap
    expect(instance.gapInBufferedRanges(0)).toBe(true);
  });

  it('no gap with single time range', () => {
    instance.sourceBuffer.buffered.ranges.pop();
    expect(instance.gapInBufferedRanges(0)).toBe(false);
  });

  it('no gap with multiple contiguous ranges', () => {
    instance.sourceBuffer.buffered.ranges.shift();
    instance.sourceBuffer.buffered.ranges.push([
      15,
      20,
    ]);
    expect(instance.gapInBufferedRanges(0)).toBe(false);
  });

  it('no time ranges present', () => {
    instance.sourceBuffer.buffered.ranges.length = 0;
    expect(instance.gapInBufferedRanges(0)).toBe(false);
  });
});

describe('SourceBuffer.getTimes()', () => {
  it('multiple time ranges with gap', () => {
    const times = instance.getTimes();

    const knownTimes = [
      {
        previousBufferSize: null,
        currentBufferSize: 0.034,
        bufferTimeStart: 0,
        bufferTimeEnd: 0.034,
      },
      {
        previousBufferSize: null,
        currentBufferSize: 5,
        bufferTimeStart: 10,
        bufferTimeEnd: 15,
      },
    ];
    expect(_.isEqual(times, knownTimes)).toBe(true);
  });

  it('single time range', () => {
    instance.sourceBuffer.buffered.ranges.shift();
    const times = instance.getTimes();
    const knownTimes = [
      {
        previousBufferSize: null,
        currentBufferSize: 5,
        bufferTimeStart: 10,
        bufferTimeEnd: 15,
      },
    ];
    expect(_.isEqual(times, knownTimes)).toBe(true);
  });
});

describe('SourceBuffer.trim()', () => {
  it('trim if buffer exceeds size', () => {
    jest.spyOn(SourceBuffer, 'getDefaultBufferSizeLimit').mockReturnValue(4);
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
    sourceBuffer.trim();
    jest.spyOn(sourceBuffer.sourceBuffer, 'remove');
    expect(sourceBuffer.sourceBuffer.remove).toHaveBeenCalledWith(0, 2);
  });

  it('should clear the buffer when shouldClear is true', () => {
    instance.trim(undefined, true);

    expect(instance.sourceBuffer.remove).toHaveBeenCalledWith(0, Infinity);
    expect(instance.logger.debug).toHaveBeenCalledWith('Clearing buffer...');
    expect(instance.logger.debug).toHaveBeenCalledWith('Successfully cleared buffer...');
  });

  it('should handle DOMException gracefully', () => {
    instance.sourceBuffer.remove.mockImplementation(() => {
      throw new DOMException();
    });

    instance.trim();

    expect(instance.logger.info).toHaveBeenCalledWith(
      'Encountered DOMException while trying to trim buffer',
    );
  });

  it('should throw non-DOMException errors', () => {
    instance.sourceBuffer.remove.mockImplementation(() => {
      throw new Error('Test error');
    });

    expect(() => instance.trim()).toThrow('Test error');
  });
});
