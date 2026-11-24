/**
 * Läuft als erstes Skript im Seitenkopf. Manche eingebetteten Browser (z. B.
 * Gmail-/Instagram-App auf dem iPhone, Privatmodus, gesperrte Website-Daten)
 * werfen schon beim Zugriff auf localStorage/sessionStorage einen SecurityError.
 * Dann ersetzen wir den Speicher durch einen flüchtigen Arbeitsspeicher, damit
 * die Seite startet, statt abzustürzen. Ist echter Speicher nutzbar, bleibt er.
 */
export const STORAGE_GUARD_SCRIPT = `(function(){function mem(){var d={};return{get length(){return Object.keys(d).length},key:function(i){return Object.keys(d)[i]||null},getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d={}}}}
["localStorage","sessionStorage"].forEach(function(n){var ok=false;try{var s=window[n];var t="__mt_probe__";s.setItem(t,"1");s.removeItem(t);ok=true}catch(e){}
if(!ok){try{Object.defineProperty(window,n,{configurable:true,enumerable:true,value:mem()})}catch(e){}}});})();`;
