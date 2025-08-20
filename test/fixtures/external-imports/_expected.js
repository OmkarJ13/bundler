import { bar } from "foo";
import foo from "foo";
import * as baz from "baz";
import "exteral-side-effect";
console.log(foo, bar, baz);