import { foo } from 'foo';
import { bar } from './named';
import { bar as barFromNamespace } from './namespace';
import { bar as barFromDefault } from './default';
import { stuff } from './all';

console.log(foo, bar, barFromNamespace, barFromDefault, stuff);
