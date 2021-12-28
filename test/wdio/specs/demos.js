describe('Demo Page', () => {
    describe('Base URL', async () => {
        it('Should redirect to "/demos"', async () => {
            await browser.url(`/`);
            await expect(browser).toHaveUrlContaining('/demos')
        })
    })

    describe('Single Player Demo Button', async () => {
        it('Should Exist', async () => {
            await browser.url(`/demos`);

            const SinglePlayerDemoButton = await $('button=Single Player Demo');
            await expect(SinglePlayerDemoButton).toExist();
        })

        it('Should direct you to /single-player', async () => {
            await browser.url(`/demos`);

            const SinglePlayerDemoButton = await $('button=Single Player Demo');
            await SinglePlayerDemoButton.click()
            await expect(browser).toHaveUrlContaining('/single-player')
        })
    })
});

