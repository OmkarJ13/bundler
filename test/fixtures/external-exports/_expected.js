import { foo, bar as baz } from 'foo';
import * as bax from 'bax';
import stuff from 'stuff';
import { "stuff-2" as stuff2 } from 'stuff';
import { unknown1, unknown2, unknown3 } from 'stuff';
import 'hehe';


console.log(foo, baz, bax, stuff, stuff2);
console.log(unknown1, unknown2, unknown3);
