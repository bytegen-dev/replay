/**
 * The script that hides what is below the fold before the first paint (see the landing page for why). It is written into the page as plain
 * HTML inside a hidden box, not as a script element of the component: the browser runs it as the server's page loads, but when React builds
 * the page on the client (a navigation from another page) the same markup is inert, so there is no warning about a script that would never
 * run, and nothing for hydration to disagree about. On the client RevealObserver does this job itself.
 */
const PRIME =
  '(function(){try{var d=document.documentElement;if(d.dataset.motion==="reduce"||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var a=document.querySelectorAll("[data-reveal-on-scroll]"),f=-1;for(var i=0;i<a.length;i++){var v=a[i].style.getPropertyValue("--n");if(v!==""&&a[i].getBoundingClientRect().top>=innerHeight*0.9){f=+v;break}}if(f<0)return;d.style.setProperty("--from",f);d.classList.add("reveal-pre");setTimeout(function(){if(!window.__revealReady)d.classList.remove("reveal-pre")},5000)}catch(e){}})()';

export function RevealPrime() {
  return <div hidden dangerouslySetInnerHTML={{ __html: `<script>${PRIME}</script>` }} />;
}
