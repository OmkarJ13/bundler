import { foo, bar as baz } from 'foo';
import * as bax from 'bax';
import stuff from 'stuff';
import { "stuff-2" as stuff2 } from 'stuff';
import { unknown1, unknown2, unknown3, unknown4, unknown5 } from 'stuff';
import 'hehe';

const namespace = Object.freeze({
  "foo": foo,
  "baz": baz,
  "bax": bax,
  "stuff": stuff,
  "unknown1": unknown1,
  "unknown2": unknown2,
  "unknown3": unknown3,
  "unknown4": unknown4,
  "unknown5": unknown5
});
console.log(foo, baz, bax, stuff, stuff2);
console.log(unknown1, unknown2, unknown3);
console.log(namespace.unknown4);
console.log(namespace['unknown5']);
