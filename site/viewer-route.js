'use strict';
(() => {
 // The fallback keeps assets relative to /share/, even after showing /share/name.
 const base=new URL('./',location.href),params=new URLSearchParams(location.search);
 const slug=params.get('viewer')||location.pathname.match(/\/share\/([a-z0-9-]+)\/?$/)?.[1]||'';
 const valid=/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug);
 window.CRM_VIEWER={slug:valid?slug:'',token:new URLSearchParams(location.hash.slice(1)).get('access')||'',requested:!!slug};
 if(valid&&params.has('viewer')){
  const tag=document.createElement('base');tag.href=base.href;document.head.prepend(tag);
  history.replaceState(null,'',new URL(slug,base).pathname+location.hash);
 }
})();
