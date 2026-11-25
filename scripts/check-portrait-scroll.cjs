// Run this probe with Runtime.evaluate after a touch swipe on a live portrait table.
module.exports = function checkPortraitScroll() {
  const shell = document.querySelector('main.pt-shell, main.pt-aof');
  if (!shell || !shell.scrollTop) throw Error('The table did not scroll');
  const info = shell.querySelector('.hand-filter-panel, .aof-bankroll');
  if (!info || !info.offsetHeight) throw Error('Table information is hidden');
  if (shell.scrollWidth > shell.clientWidth + 1) throw Error('Horizontal overflow');
  return true;
};
