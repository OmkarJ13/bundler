import stuff2, {
  foo,
  baz,
  bax,
  stuff,
  unknown1,
  unknown2,
  unknown3,
} from './foo';

import * as namespace from './foo';

console.log(foo, baz, bax, stuff, stuff2);
console.log(unknown1, unknown2, unknown3);
console.log(namespace.unknown4);
console.log(namespace['unknown5']);
