import MediaSource from 'MediaSource'; // Import the mocked MediaSource
import SourceBuffer from '../SourceBuffer';
import MediaSourceWrapper from '../MediaSourceWrapper';

const _ = require('lodash');

beforeEach(() => {
  global.window.MediaSource = MediaSource;
});

describe('SourceBuffer.gapInBufferedRanges()', () => {
  it('should detect a gap between time ranges', () => {
    // Add a SourceBuffer to the MediaSource
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));

    // Check that there is indeed a gap
    expect(sourceBuffer.gapInBufferedRanges(0)).toBe(true);
  });

  it('no gap with single time range', () => {
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
    sourceBuffer.sourceBuffer.buffered.ranges.pop();
    expect(sourceBuffer.gapInBufferedRanges(0)).toBe(false);
  });

  it('no gap with multiple contiguous ranges', () => {
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
    sourceBuffer.sourceBuffer.buffered.ranges.shift();
    sourceBuffer.sourceBuffer.buffered.ranges.push([
      15,
      20,
    ]);
    expect(sourceBuffer.gapInBufferedRanges(0)).toBe(false);
  });

  it('no time ranges present', () => {
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
    sourceBuffer.sourceBuffer.buffered.ranges.length = 0;
    expect(sourceBuffer.gapInBufferedRanges(0)).toBe(false);
  });
});

describe('SourceBuffer.getTimes()', () => {
  it('multiple time ranges with gap', () => {
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
    const times = sourceBuffer.getTimes();

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
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));
    sourceBuffer.sourceBuffer.buffered.ranges.shift();
    const times = sourceBuffer.getTimes();
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
});
