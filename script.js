
// basic helpers
function $(s, root=document){return root.querySelector(s)}
function $all(s, root=document){return [...root.querySelectorAll(s)]}

document.addEventListener('DOMContentLoaded', () => {
  // smooth anchor
  $all('a[href^="#"]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if(el){ e.preventDefault(); el.scrollIntoView({behavior:'smooth', block:'start'}); }
    })
  });
  // code for collapsing: <details> native is fine; we just add auto-close within group
  $all('details[data-group]').forEach(d => {
    d.addEventListener('toggle', () => {
      if(d.open){
        const group = d.dataset.group;
        $all(`details[data-group='${group}']`).forEach(o => { if(o!==d) o.open=false; });
      }
    });
  });

  // Disqus auto init if shortname is provided via global CONFIG
  if(window.SITE_CONFIG && window.SITE_CONFIG.disqusShortname){
    const shortname = window.SITE_CONFIG.disqusShortname;
    const d = document, s = d.createElement('script');
    s.src = 'https://' + shortname + '.disqus.com/embed.js';
    s.setAttribute('data-timestamp', +new Date());
    (d.head || d.body).appendChild(s);
  } else {
    const slot = $('#comments-slot');
    if(slot){
      slot.innerHTML = '<div class="note"><strong>コメント欄を有効化するには:</strong> <br>assets/config.js の <code>disqusShortname</code> を設定し、サイトを再読み込みしてください。<br>（匿名投稿可／モデレーションはDisqus管理画面から）</div>';
    }
  }
});

