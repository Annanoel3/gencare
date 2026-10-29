// Keeps the phone's notification question from landing on top of the welcome
// chat. ADHDone's rule, used here too: notifications are asked right AFTER
// the welcome chat, with the chat's last line saying why.
//
// WelcomeDialog says whether it's showing ('open'), not needed ('none') or
// finished ('done'); OneSignalInit waits for anything but 'open' before it
// asks. If the chat hasn't decided within a few seconds (the account didn't
// load), the question goes ahead as it always did.
let state = 'unknown';
const waiters = new Set();

export function setWelcomeState(next) {
  state = next;
  if (next !== 'open' && next !== 'unknown') {
    for (const w of [...waiters]) w();
    waiters.clear();
  }
}

export function welcomeState() {
  return state;
}

export function waitForWelcome(decideMs = 8000) {
  if (state === 'none' || state === 'done') return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; waiters.delete(finish); resolve(); } };
    waiters.add(finish);
    // Only an undecided chat times out; an open one is waited for.
    setTimeout(() => { if (state === 'unknown') finish(); }, decideMs);
  });
}
