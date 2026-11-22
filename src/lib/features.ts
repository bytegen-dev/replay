/**
 * Whether people can create accounts and sign in. Off until launch, when the waitlist is what visitors are offered, so nothing on the site
 * mentions signing in. The code behind it stays: set ACCOUNTS_OPEN=1 to turn it back on (it still needs the mail settings to send the link in
 * production).
 */
export const accountsOpen = (): boolean => process.env.ACCOUNTS_OPEN === "1";

/**
 * Whether the Currencies tab (spend one currency on another every month) is offered on the Wayback page. Hidden for now: the tab's code and its
 * API stay in place, only the button and the link into it are off. Set to true to bring it back.
 */
export const CURRENCIES_TAB = false;
