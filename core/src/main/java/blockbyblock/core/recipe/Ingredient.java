package blockbyblock.core.recipe;

/** One crafting input: a specific item, any item with a tag, or any item from a list. */
public final class Ingredient {
    public enum Kind { ITEM, TAG, ANY }

    public final Kind kind;
    /** Item id, tag name, or the ids of an ANY list. */
    private final String[] values;
    public final int count;

    private Ingredient(Kind kind, String[] values, int count) {
        this.kind = kind;
        this.values = values.clone();
        this.count = count;
    }

    public static Ingredient item(String id, int count) { return new Ingredient(Kind.ITEM, new String[] {id}, count); }
    public static Ingredient tag(String tag, int count) { return new Ingredient(Kind.TAG, new String[] {tag}, count); }
    public static Ingredient any(String[] ids, int count) { return new Ingredient(Kind.ANY, ids, count); }

    /** The id, tag or {@code |}-joined id list, as written in the golden CSV. */
    public String value() { return String.join("|", values); }

    /** Whether an item with this id and these tags satisfies the ingredient (count is checked by the caller). */
    public boolean matches(String itemId, blockbyblock.core.item.ItemDefinition item) {
        switch (kind) {
            case ITEM: return values[0].equals(itemId);
            case TAG: return item != null && item.hasTag(values[0]);
            default:
                // Short fixed lists from the generated table.
                for (String id : values) if (id.equals(itemId)) return true;
                return false;
        }
    }
}
