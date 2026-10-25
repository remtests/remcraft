'use strict';

// Les textures sont des fichiers : ouvert en double-clic (file://), le navigateur bloque leur lecture
// (« canvas tainted ») et le jeu plante à la génération du monde. On prévient clairement.
if(location.protocol === 'file:'){
  window.addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000d;color:#fff;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;font:16px/1.6 "Courier New",monospace;text-align:center;padding:24px';
    d.innerHTML = '<div style="max-width:620px"><h2 style="color:#ff5555;margin-bottom:12px">Serveur local requis</h2>'
      + '<p>Le jeu ne peut pas fonctionner en ouvrant <b>index.html</b> directement (file://).</p>'
      + '<p style="margin:12px 0">Lancez <b>serve.bat</b> (Windows) ou <b>./serve.sh</b> (Mac/Linux),<br>'
      + 'puis ouvrez <b>http://localhost:8000</b><br>ou publiez le dépôt sur GitHub Pages.</p></div>';
    document.body.appendChild(d);
  });
}
