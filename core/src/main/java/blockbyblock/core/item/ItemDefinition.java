package blockbyblock.core.item;

import java.util.HashMap;
import java.util.Map;

/**
 * Immutable projection of the JS item registry, generated into {@link GeneratedItems} from
 * src/inventory.js. Rendering fields (textures, icons, display profiles) are deliberately absent.
 */
public final class ItemDefinition {
    public final String id;
    /** The name shown to players, as in server replies ("Gave 5 Stone."). */
    public final String name;
    public final int maxStack;
    /** True when the item places a block of the same id. */
    public final boolean isBlock;
    /** "pickaxe", "axe", "shovel", "hoe", "sword" or "shears"; null when the item is not a tool. */
    public final String toolType;
    public final double toolSpeed;
    public final int toolLevel;
    /** Uses before breaking; 0 when the item does not wear out. */
    public final int durability;
    /** Hunger restored; -1 when the item is not food. */
    public final int foodHunger;
    public final double foodSaturation;
    private final String[] tags;

    ItemDefinition(String id, String name, int maxStack, boolean isBlock, String toolType, double toolSpeed, int toolLevel,
                   int durability, int foodHunger, double foodSaturation, String[] tags) {
        this.id = id;
        this.name = name;
        this.maxStack = maxStack;
        this.isBlock = isBlock;
        this.toolType = toolType;
        this.toolSpeed = toolSpeed;
        this.toolLevel = toolLevel;
        this.durability = durability;
        this.foodHunger = foodHunger;
        this.foodSaturation = foodSaturation;
        this.tags = tags.clone();
    }

    public boolean hasTag(String tag) {
        // Short fixed arrays from the generated table.
        for (String t : tags) if (t.equals(tag)) return true;
        return false;
    }

    public boolean isTool() { return toolType != null; }
    public boolean isFood() { return foodHunger >= 0; }

    private static final Map<String, ItemDefinition> BY_ID = new HashMap<>(); // lookup only; never iterated
    private static final ItemDefinition[] ALL = GeneratedItems.all();
    static {
        for (ItemDefinition definition : ALL) BY_ID.put(definition.id, definition);
    }

    /** Every item in registration order. */
    public static ItemDefinition[] all() { return ALL.clone(); }

    public static boolean exists(String id) { return id != null && BY_ID.containsKey(id); }

    public static ItemDefinition forId(String id) {
        if (id == null) throw new IllegalArgumentException("Item ID must not be null");
        ItemDefinition definition = BY_ID.get(id);
        if (definition == null) throw new IllegalArgumentException("Unknown item ID: " + id);
        return definition;
    }
}
