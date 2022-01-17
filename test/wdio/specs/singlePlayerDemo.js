describe('Single Player Demo Page', () => {
  it('Should show loading animation when playing a video', async () => {
    await browser.url('/demos/single-player');

    await $('[title="Use /src files"]').click();
    await $('[title="Let CLSP Player Create Video Element"]').click();

    const loadingAnimation = await $('.clsp-player-loading-animation');
    await expect(loadingAnimation).toExist();
  });
});
