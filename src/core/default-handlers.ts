import type { HandlerData } from "./game-data.js";
import { SYSTEM_VERBS } from "./verb-types.js";

/** Default verb handlers expressed as data records. */
export const DEFAULT_HANDLERS: HandlerData[] = [
  {
    name: "look",
    pattern: { verb: "look", verbAliases: ["l"], form: "intransitive" },
    freeTurn: true,
    perform: "return await lib.describeRoom();",
  },

  {
    name: "look-at",
    pattern: { verb: "look", verbAliases: ["l"], form: "prepositional", prep: "direction" },
    freeTurn: true,
    perform: "return await lib.examine(object);",
  },

  {
    name: "examine",
    pattern: {
      verb: "examine",
      verbAliases: ["x", "look", "l", "check", "describe", "read", "watch"],
      form: "transitive",
    },
    freeTurn: true,
    perform: "return await lib.examine(object);",
  },

  {
    name: "take",
    pattern: {
      verb: "take",
      verbAliases: ["get", "g", "grab", "carry", "hold", "pick", "pick-up"],
      form: "transitive",
    },
    objectRequirements: { tags: ["portable"] },
    check: "return object.location !== player.id;",
    veto: "return await lib.checkCarryCapacity();",
    perform: "return await lib.take(object);",
  },

  {
    name: "take-fixed",
    pattern: {
      verb: "take",
      verbAliases: ["get", "g", "grab", "carry", "hold", "pick", "pick-up"],
      form: "transitive",
    },
    priority: -5,
    perform:
      "if (object.properties.takeRefusal) return await lib.result('{!' + object.properties.takeRefusal + '!}'); if (object.properties.fixed) return await lib.result('{!The ' + await lib.ref(object) + ' is fixed in place.!}'); return await lib.result('{!You can\\'t take the ' + await lib.ref(object) + '.!}');",
  },

  {
    name: "take-from",
    pattern: { verb: "take", form: "ditransitive", prep: "source" },
    priority: 10,
    indirectRequirements: { tags: ["container"] },
    check: "return object.location === indirect.id;",
    veto: "if (indirect.tags.includes('openable') && !indirect.properties.open) return 'The ' + await lib.ref(indirect) + ' is closed.'; return null;",
    perform: "return await lib.takeFrom(object, indirect);",
  },

  {
    name: "drop",
    pattern: { verb: "drop", verbAliases: ["discard", "throw"], form: "transitive" },
    check: "return object.location === player.id;",
    perform: "return await lib.drop(object);",
  },

  {
    name: "inventory",
    pattern: { verb: "inventory", verbAliases: ["i"], form: "intransitive" },
    freeTurn: true,
    perform: "return await lib.showInventory();",
  },

  {
    name: "open",
    pattern: { verb: "open", verbAliases: ["unwrap", "uncover"], form: "transitive" },
    objectRequirements: { tags: ["openable"] },
    veto: "if (object.properties.locked) return 'The ' + await lib.ref(object) + ' is locked.'; if (object.properties.open) return 'The ' + await lib.ref(object) + ' is already open.'; return null;",
    perform: "return await lib.open(object);",
  },

  {
    name: "close",
    pattern: { verb: "close", verbAliases: ["shut", "cover"], form: "transitive" },
    objectRequirements: { tags: ["openable"] },
    veto: "if (!object.properties.open) return 'The ' + await lib.ref(object) + ' is already closed.'; return null;",
    perform: "return await lib.close(object);",
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
    check: "return object.location === player.id;",
    veto: "if (indirect.tags.includes('openable') && !indirect.properties.open) return 'The ' + await lib.ref(indirect) + ' is closed.'; return null;",
    perform: "return await lib.putIn(object, indirect);",
  },

  {
    name: "unlock-with",
    pattern: { verb: "unlock", form: "ditransitive", prep: "instrument" },
    objectRequirements: { properties: { locked: true } },
    veto: "var requiredKey = object.properties.unlockedBy; if (requiredKey && indirect.id !== requiredKey) return 'The ' + await lib.ref(indirect) + \" doesn't fit the \" + await lib.ref(object) + '.'; return null;",
    perform: "return await lib.unlockWith(object, indirect);",
  },

  {
    name: "unlock",
    pattern: { verb: "unlock", form: "transitive" },
    objectRequirements: { properties: { locked: true } },
    check: "return !!await lib.findKey(object);",
    perform: "return await lib.unlock(object);",
  },

  {
    name: "lock",
    pattern: { verb: "lock", form: "transitive" },
    objectRequirements: { tags: ["openable"], properties: { locked: false } },
    check: "return !!object.properties.unlockedBy && !!await lib.findKey(object);",
    veto: "if (object.properties.open) return 'You need to close the ' + await lib.ref(object) + ' first.'; return null;",
    perform: "return await lib.lock(object);",
  },

  {
    name: "switch-on",
    pattern: { verb: "turn-on", verbAliases: ["turn", "switch", "light"], form: "transitive" },
    objectRequirements: { tags: ["device"] },
    check: "return !object.properties.switchedOn;",
    perform: "return await lib.switchOn(object);",
  },

  {
    name: "switch-off",
    pattern: {
      verb: "turn-off",
      verbAliases: ["turn", "switch", "extinguish", "douse"],
      form: "transitive",
    },
    objectRequirements: { tags: ["device"] },
    check: "return !!object.properties.switchedOn;",
    perform: "return await lib.switchOff(object);",
  },

  {
    name: "help",
    pattern: { verb: "help", form: "intransitive" },
    freeTurn: true,
    perform: "return await lib.showHelp();",
  },

  {
    name: "score",
    pattern: { verb: "score", form: "intransitive" },
    freeTurn: true,
    perform: "return await lib.showScore();",
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
    perform: "return await lib.incrementVisits();",
  },
];
