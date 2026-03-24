import type { VerbHandler, VerbContext, PerformResult, WorldEvent } from "../../core/verbs.js";

function setPropEvent(
  entityId: string,
  { property, value, description }: { property: string; value: unknown; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property, value, description };
}

function moveEvent(
  entityId: string,
  { to, description }: { to: string; description: string },
): WorldEvent {
  return { type: "set-property", entityId, property: "location", value: to, description };
}

// --- Bird/Snake puzzle ---

/** Catching the bird requires the cage and no rod */
export const catchBird: VerbHandler = {
  name: "catch-bird",
  source: "puzzles.ts",
  pattern: { verb: "take", verbAliases: ["get", "catch", "capture"], form: "transitive" },
  priority: 10,
  entityId: "item:bird",
  perform(context: VerbContext): PerformResult {
    const bird = context.command.form === "transitive" ? context.command.object : null;
    if (!bird) return { output: "Catch what?", events: [] };

    if (bird.properties["location"] === "item:cage") {
      return {
        output:
          "You already have the little bird. If you take it out of the cage it will likely fly away from you.",
        events: [],
      };
    }

    const cage = context.store.tryGet("item:cage");
    if (!cage || cage.properties["location"] !== context.player.id) {
      return { output: "You can catch the bird, but you cannot carry it.", events: [] };
    }

    const rod = context.store.tryGet("item:rod");
    if (rod && rod.properties["location"] === context.player.id) {
      return {
        output:
          "The bird was unafraid when you entered, but as you approach it becomes disturbed and you cannot catch it.",
        events: [],
      };
    }

    return {
      output: "You catch the bird in the wicker cage.",
      events: [
        moveEvent("item:bird", { to: "item:cage", description: "Bird caught in cage" }),
        setPropEvent("item:cage", { property: "open", value: false, description: "Cage closed" }),
      ],
    };
  },
};

/** Dropping/releasing the bird - drives away the snake if present */
export const releaseBird: VerbHandler = {
  name: "release-bird",
  source: "puzzles.ts",
  pattern: { verb: "drop", verbAliases: ["release", "free"], form: "transitive" },
  priority: 10,
  entityId: "item:bird",
  check(context: VerbContext) {
    if (context.command.form !== "transitive") return { applies: false };
    const bird = context.command.object;
    if (bird.properties["location"] !== "item:cage") return { applies: false };
    return { applies: true };
  },
  perform(context: VerbContext): PerformResult {
    const events: WorldEvent[] = [
      setPropEvent("item:cage", { property: "open", value: true, description: "Cage opened" }),
      moveEvent("item:bird", { to: context.room.id, description: "Bird released" }),
    ];

    const snake = context.store.tryGet("item:snake");
    if (snake && snake.properties["location"] === context.room.id) {
      events.push(
        moveEvent("item:snake", { to: "void", description: "Snake driven away by bird" }),
      );
      return {
        output:
          "The little bird attacks the green snake, and in an astounding flurry drives the snake away.",
        events,
      };
    }

    const dragon = context.store.tryGet("item:dragon");
    if (dragon && dragon.properties["location"] === context.room.id) {
      events.push(moveEvent("item:bird", { to: "void", description: "Bird killed by dragon" }));
      return {
        output:
          "The little bird attacks the green dragon, and in an astounding flurry gets burnt to a cinder. The ashes blow away.",
        events,
      };
    }

    return { output: "The little bird flies free.", events };
  },
};

// --- Beanstalk puzzle ---

/** Watering the plant makes it grow */
export const waterPlant: VerbHandler = {
  name: "water-plant",
  source: "puzzles.ts",
  pattern: { verb: "water", verbAliases: ["pour"], form: "transitive" },
  priority: 10,
  entityId: "item:plant",
  perform(context: VerbContext): PerformResult {
    const bottle = context.store.tryGet("item:bottle");
    if (!bottle || bottle.properties["location"] !== context.player.id) {
      return { output: "You have nothing to water the plant with.", events: [] };
    }
    const water = context.store.tryGet("item:water");
    if (!water || water.properties["location"] !== "item:bottle") {
      return { output: "The bottle is empty.", events: [] };
    }

    const plant = context.store.get("item:plant");
    const size = (plant.properties["plantSize"] as string) || "tiny";
    const events: WorldEvent[] = [
      moveEvent("item:water", { to: "void", description: "Water used" }),
    ];

    if (size === "tiny") {
      events.push(
        setPropEvent("item:plant", {
          property: "plantSize",
          value: "tall",
          description: "Plant grew to tall",
        }),
      );
      return {
        output: "The plant spurts into furious growth for a few seconds.",
        events,
      };
    }
    if (size === "tall") {
      events.push(
        setPropEvent("item:plant", {
          property: "plantSize",
          value: "huge",
          description: "Plant grew to huge",
        }),
      );
      return {
        output: "The plant grows explosively, almost filling the bottom of the pit.",
        events,
      };
    }
    events.push(
      setPropEvent("item:plant", {
        property: "plantSize",
        value: "tiny",
        description: "Plant shriveled",
      }),
    );
    return {
      output: "You've over-watered the plant! It's shriveling up! It's, it's...",
      events,
    };
  },
};

// --- Dragon puzzle ---

/** Attacking the dragon with bare hands */
export const attackDragon: VerbHandler = {
  name: "attack-dragon",
  source: "puzzles.ts",
  pattern: { verb: "attack", verbAliases: ["kill", "fight", "hit", "slay"], form: "transitive" },
  priority: 10,
  entityId: "item:dragon",
  perform(context: VerbContext): PerformResult {
    const dragon = context.store.get("item:dragon");
    if (dragon.properties["questioning"] === true) {
      return { output: "You already asked. Answer yes or no.", events: [] };
    }
    return {
      output: "With what? Your bare hands?",
      events: [
        setPropEvent("item:dragon", {
          property: "questioning",
          value: true,
          description: "Dragon asked about bare hands",
        }),
      ],
    };
  },
};

/** Saying yes to slay the dragon */
export const sayYes: VerbHandler = {
  name: "say-yes",
  source: "puzzles.ts",
  pattern: { verb: "yes", verbAliases: ["y"], form: "intransitive" },
  priority: 10,
  check(context: VerbContext) {
    const dragon = context.store.tryGet("item:dragon");
    if (!dragon) return { applies: false };
    if (dragon.properties["questioning"] !== true) return { applies: false };
    return { applies: true };
  },
  perform(): PerformResult {
    return {
      output:
        "Congratulations! You have just vanquished a dragon with your bare hands! (Unbelievable, isn't it?)",
      events: [
        moveEvent("item:dragon", { to: "void", description: "Dragon vanquished" }),
        setPropEvent("item:dragon", {
          property: "questioning",
          value: false,
          description: "Dragon no longer questioning",
        }),
      ],
    };
  },
};

// --- Bear puzzle ---

/** Give food to the bear to make it friendly */
export const feedBear: VerbHandler = {
  name: "feed-bear",
  source: "puzzles.ts",
  pattern: { verb: "give", verbAliases: ["feed"], form: "ditransitive" },
  priority: 10,
  entityId: "item:bear",
  check(context: VerbContext) {
    if (context.command.form !== "ditransitive") return { applies: false };
    const gift = context.command.object;
    if (gift.id !== "item:food") return { applies: false };
    return { applies: true };
  },
  perform(): PerformResult {
    return {
      output:
        "The bear eagerly wolfs down your food, after which he seems to calm down considerably and even becomes rather friendly.",
      events: [
        moveEvent("item:food", { to: "void", description: "Food eaten by bear" }),
        setPropEvent("item:bear", {
          property: "friendly",
          value: true,
          description: "Bear is now friendly",
        }),
      ],
    };
  },
};
