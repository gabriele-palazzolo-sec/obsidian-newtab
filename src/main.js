// Entry point: loads the configuration, then starts each part of the page.
(async function () {
  await App.init();
  const parts = [Header, Bookmarks, Reader, Graph, News, NewsEditor];
  for (const part of parts) {
    try {
      await part.init();
    } catch (e) {
      // one broken section must not take the whole page down
      console.error("[newtab]", e);
    }
  }
})();
