import MSEWrapper from '../MSEWrapper';
import MediaSource from 'MediaSource'; // Import the mocked MediaSource

describe('MSEWrapper#onVideoSegmentShown()', () => {
  let instance;

  beforeEach(async () => {
    global.window.MediaSource = MediaSource;
    instance = MSEWrapper.factory('test');
    instance.mediaSource = global.window.mediaSource;

    await instance.initialize();
    await instance.initializeSourceBuffer('video/mp4; codecs="avc1.42E01E"');
  });

  it('stream re-init', () => {
    const emitSpy = jest.spyOn(instance, 'emit');

    instance.sourceBuffer.emit('updateend');
    instance.sourceBuffer.emit('updateend');
    instance.sourceBuffer.emit('updateend');

    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(instance.emit).toHaveBeenCalledWith(MSEWrapper.events.STREAM_FROZEN);
  });
});
