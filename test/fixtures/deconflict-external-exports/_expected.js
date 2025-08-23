import { bar, foo, stuff as stuff$1 } from "foo";
import bar$2 from "foo";
import * as bar$1 from "foo";
import * as ijij from "ijij";
function _mergeNamespaces(n, m) {
  m.forEach(function (e) {
    e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
      if (k !== 'default' && !(k in n)) {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () {
            return e[k];
          }
        });
      }
    });
  });
  return Object.freeze(n);
}
const stuff = 'internalStuff';
console.log(stuff);
const all = _mergeNamespaces({
  "stuff": stuff$1
}, [bar$1, ijij]);
console.log(foo, bar, bar$1, bar$2, stuff$1, all, bar$1);