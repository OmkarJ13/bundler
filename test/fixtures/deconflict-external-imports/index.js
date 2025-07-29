import { foo } from 'foo';
import { message } from './named';
import { message as messageFromNamespace } from './namespace';
import { message as messageFromDefault } from './default';

console.log(foo, message, messageFromNamespace, messageFromDefault);
