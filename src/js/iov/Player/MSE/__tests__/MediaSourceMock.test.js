import MediaSource from 'MediaSource'; // Import the mocked MediaSource

describe('MediaSource with SourceBuffer', () => {
  let mediaSource;

  beforeEach(() => {
    // Create a new instance of the MediaSource mock
    mediaSource = new MediaSource();
  });

  it('should interact with SourceBuffer and detect a gap between time ranges', () => {
    // Add a SourceBuffer to the MediaSource
    const sourceBuffer = mediaSource.addSourceBuffer();
    const buffered = sourceBuffer.buffered;

    // The time ranges should be non-contiguous, indicating a gap
    expect(buffered).toHaveLength(2); // There should be two ranges
    expect(buffered.start(0)).toBe(0); // The first range starts at 0
    expect(buffered.end(0)).toBe(0.034); // The first range ends at 5
    expect(buffered.start(1)).toBe(10); // The second range starts at 10 (gap between 5 and 10)
    expect(buffered.end(1)).toBe(15); // The second range ends at 15

    // Check that there is indeed a gap
    expect(buffered.start(1) - buffered.end(0)).toBeGreaterThan(0); // There should be a gap between the ranges
  });
});
