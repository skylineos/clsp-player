import MediaSource from 'MediaSource'; // Import the mocked MediaSource
import SourceBuffer from '../SourceBuffer';
import MediaSourceWrapper from '../MediaSourceWrapper';

beforeEach(() => {
  global.window.MediaSource = MediaSource;
});

describe('SourceBuffer', () => {
  it('should  detect a gap between time ranges', () => {
    // Add a SourceBuffer to the MediaSource
    const sourceBuffer = SourceBuffer.factory('test', 'video/mp4', new MediaSourceWrapper('test'));

    // Check that there is indeed a gap
    expect(sourceBuffer.gapInBufferedRanges(0)).toBe(true);
  });
});
