import Sval from "sval";

class MyLib {
  name = "test";
  tryGet(id: string) { return "got " + id; }
}

const lib = new MyLib();

// Test 1: raw import
const i1 = new Sval({ ecmaVer: "latest", sourceType: "script", sandBox: true });
i1.import({ lib });
i1.run('exports.result = typeof lib.tryGet;');
console.log("Test 1 - raw class instance:", i1.exports.result);

// Test 2: plain wrapper
const wrapper: Record<string, unknown> = {};
let proto = Object.getPrototypeOf(lib);
while (proto && proto !== Object.prototype) {
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor") continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc && typeof desc.value === "function") {
      wrapper[name] = desc.value.bind(lib);
    }
  }
  proto = Object.getPrototypeOf(proto);
}
Object.assign(wrapper, lib);
const i2 = new Sval({ ecmaVer: "latest", sourceType: "script", sandBox: true });
i2.import({ lib: wrapper });
i2.run('exports.result = typeof lib.tryGet;');
console.log("Test 2 - plain wrapper:", i2.exports.result);

// Test 3: what does sval actually see?
const i3 = new Sval({ ecmaVer: "latest", sourceType: "script", sandBox: true });
i3.import({ lib });
i3.run('var keys = []; for (var k in lib) { keys.push(k); } exports.result = keys.join(", ");');
console.log("Test 3 - for-in keys:", i3.exports.result);

// Test 4: Object.keys inside sval
const i4 = new Sval({ ecmaVer: "latest", sourceType: "script", sandBox: true });
i4.import({ lib: wrapper });
i4.run('exports.result = Object.keys(lib).join(", ");');
console.log("Test 4 - wrapper Object.keys:", i4.exports.result);

// Test 5: direct property access
const i5 = new Sval({ ecmaVer: "latest", sourceType: "script", sandBox: true });
i5.import({ lib: wrapper });
i5.run('exports.result = lib.tryGet("hello");');
console.log("Test 5 - wrapper call:", i5.exports.result);
