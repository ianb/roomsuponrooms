import type { HandlerData } from "./game-data.js";
import { SYSTEM_VERBS } from "./verb-types.js";

/** Default verb handlers expressed as data records. */
export const DEFAULT_HANDLERS: HandlerData[] = [
  {
    name: "look",
    pattern: { verb: "look", verbAliases: ["l"], form: "intransitive" },
    freeTurn: true,
    perform: "return lib.describeRoom();",
  },

  {
    name: "look-at",
    pattern: { verb: "look", verbAliases: ["l"], form: "prepositional", prep: "direction" },
    freeTurn: true,
    perform: "return lib.examine(object);",
  },

  {
    name: "examine",
    pattern: {
      verb: "examine",
      verbAliases: ["x", "look", "l", "check", "describe", "read", "watch"],
      form: "transitive",
    },
    freeTurn: true,
    perform: "return lib.examine(object);",
  },

  {
    name: "take",
    pattern: {
      verb: "take",
      verbAliases: ["get", "g", "grab", "carry", "hold", "pick"],
      form: "transitive",
    },
    objectRequirements: { tags: ["portable"] },
    check: "return object.properties.location !== player.id;",
    veto: "return lib.checkCarryCapacity();",
    perform: "return lib.take(object);",
  },

  {
    name: "take-fixed",
    pattern: {
      verb: "take",
      verbAliases: ["get", "g", "grab", "carry", "hold", "pick"],
      form: "transitive",
    },
    priority: -5,
    perform:
      "if (object.properties.takeRefusal) return lib.result(object.properties.takeRefusal); if (object.properties.fixed) return lib.result('The ' + lib.ref(object) + ' is fixed in place.'); return lib.result('You can\\'t take the ' + lib.ref(object) + '.');",
  },

  {
    name: "take-from",
    pattern: { verb: "take", form: "ditransitive", prep: "source" },
    priority: 10,
    indirectRequirements: { tags: ["container"] },
    check: "return object.properties.location === indirect.id;",
    veto: "if (indirect.tags.has('openable') && !indirect.properties.open) return 'The ' + lib.ref(indirect) + ' is closed.'; return null;",
    perform: "return lib.takeFrom(object, indirect);",
  },

  {
    name: "drop",
    pattern: { verb: "drop", verbAliases: ["discard", "throw"], form: "transitive" },
    check: "return object.properties.location === player.id;",
    perform: "return lib.drop(object);",
  },

  {
    name: "inventory",
    pattern: { verb: "inventory", verbAliases: ["i"], form: "intransitive" },
    freeTurn: true,
    perform: "return lib.showInventory();",
  },

  {
    name: "open",
    pattern: { verb: "open", verbAliases: ["unwrap", "uncover"], form: "transitive" },
    objectRequirements: { tags: ["openable"] },
    veto: "if (object.properties.locked) return 'The ' + lib.ref(object) + ' is locked.'; if (object.properties.open) return 'The ' + lib.ref(object) + ' is already open.'; return null;",
    perform: "return lib.open(object);",
  },

  {
    name: "close",
    pattern: { verb: "close", verbAliases: ["shut", "cover"], form: "transitive" },
    objectRequirements: { tags: ["openable"] },
    veto: "if (!object.properties.open) return 'The ' + lib.ref(object) + ' is already closed.'; return null;",
    perform: "return lib.close(object);",
  },

  {
    name: "put-in",
    pattern: {
      verb: "put",
      verbAliases: ["insert", "place"],
      form: "ditransitive",
      prep: "containment",
    },
    indirectRequirements: { tags: ["container"] },
    check: "return object.properties.location === player.id;",
    veto: "if (indirect.tags.has('openable') && !indirect.properties.open) return 'The ' + lib.ref(indirect) + ' is closed.'; return null;",
    perform: "return lib.putIn(object, indirect);",
  },

  {
    name: "unlock-with",
    pattern: { verb: "unlock", form: "ditransitive", prep: "instrument" },
    objectRequirements: { properties: { locked: true } },
    veto: "var requiredKey = object.properties.unlockedBy; if (requiredKey && indirect.id !== requiredKey) return 'The ' + lib.ref(indirect) + \" doesn't fit the \" + lib.ref(object) + '.'; return null;",
    perform: "return lib.unlockWith(object, indirect);",
  },

  {
    name: "unlock",
    pattern: { verb: "unlock", form: "transitive" },
    objectRequirements: { properties: { locked: true } },
    check: "return !!lib.findKey(object);",
    perform: "return lib.unlock(object);",
  },

  {
    name: "lock",
    pattern: { verb: "lock", form: "transitive" },
    objectRequirements: { tags: ["openable"], properties: { locked: false } },
    check: "return !!object.properties.unlockedBy && !!lib.findKey(object);",
    veto: "if (object.properties.open) return 'You need to close the ' + lib.ref(object) + ' first.'; return null;",
    perform: "return lib.lock(object);",
  },

  {
    name: "switch-on",
    pattern: { verb: "turn", verbAliases: ["switch", "light"], form: "transitive" },
    objectRequirements: { tags: ["device"] },
    check: "return !object.properties.switchedOn;",
    perform: "return lib.switchOn(object);",
  },

  {
    name: "switch-off",
    pattern: { verb: "turn", verbAliases: ["switch", "extinguish", "douse"], form: "transitive" },
    objectRequirements: { tags: ["device"] },
    check: "return !!object.properties.switchedOn;",
    perform: "return lib.switchOff(object);",
  },

  {
    name: "turn-on-prep",
    pattern: { verb: "turn", form: "prepositional", prep: "on" },
    priority: 5,
    perform:
      "if (!object.tags.has('device')) return lib.result(\"You can't turn that on.\"); if (object.properties.switchedOn) return lib.result('The ' + lib.ref(object) + ' is already on.'); return lib.switchOn(object);",
  },

  {
    name: "turn-off-prep",
    pattern: { verb: "turn", form: "prepositional", prep: "from" },
    priority: 5,
    perform:
      "if (!object.tags.has('device')) return lib.result(\"You can't turn that off.\"); if (!object.properties.switchedOn) return lib.result('The ' + lib.ref(object) + ' is already off.'); return lib.switchOff(object);",
  },

  {
    name: "help",
    pattern: { verb: "help", form: "intransitive" },
    freeTurn: true,
    perform: "return lib.showHelp();",
  },

  {
    name: "score",
    pattern: { verb: "score", form: "intransitive" },
    freeTurn: true,
    perform: "return lib.showScore();",
  },

  {
    name: "talk-to",
    pattern: {
      verb: "talk",
      verbAliases: ["speak", "chat", "converse"],
      form: "prepositional",
      prep: "target",
    },
    tag: "talkable",
    freeTurn: true,
    perform:
      'return { output: "", events: [{ type: "start-conversation", entityId: object.id, description: "Started conversation" }] };',
  },

  {
    name: "talk-to-transitive",
    pattern: {
      verb: "talk",
      verbAliases: ["speak", "chat", "converse", "use", "interact", "access"],
      form: "transitive",
    },
    tag: "talkable",
    freeTurn: true,
    perform:
      'return { output: "", events: [{ type: "start-conversation", entityId: object.id, description: "Started conversation" }] };',
  },

  {
    name: "[enter]",
    pattern: { verb: SYSTEM_VERBS.ENTER, form: "intransitive" },
    perform: "return lib.incrementVisits();",
  },
];
